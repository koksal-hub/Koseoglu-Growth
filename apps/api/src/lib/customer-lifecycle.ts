import { prisma } from './prisma';

export const LIFECYCLE_POLICY_VERSION = 'customer-lifecycle-signals-v1';
export const ACTIVE_WINDOW_DAYS = 30;
export const DORMANT_WINDOW_DAYS = 90;

const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/;

export type CustomerLifecycleState = 'NEW' | 'DEVELOPING' | 'REPEAT' | 'COOLING' | 'DORMANT' | 'REACTIVATED';

export class CustomerLifecyclePolicyError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message);
    this.name = 'CustomerLifecyclePolicyError';
  }
}

function validateCompanyId(companyId: string) {
  if (typeof companyId !== 'string' || companyId.length < 1 || companyId.length > 128 || !SAFE_ID_PATTERN.test(companyId)) {
    throw new CustomerLifecyclePolicyError(400, 'Invalid company id');
  }
}

function validateAsOf(asOf: Date) {
  if (!(asOf instanceof Date) || Number.isNaN(asOf.getTime())) {
    throw new CustomerLifecyclePolicyError(400, 'Invalid asOf');
  }
  if (asOf.getTime() > Date.now() + 5 * 60 * 1000) {
    throw new CustomerLifecyclePolicyError(400, 'asOf cannot be in the future');
  }
}

function daysBetween(later: Date, earlier: Date) {
  return Math.max(0, Math.floor((later.getTime() - earlier.getTime()) / 86_400_000));
}

export async function getCustomerLifecycle(companyId: string, asOf = new Date()) {
  validateCompanyId(companyId);
  validateAsOf(asOf);

  const [company, activities] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        leads: { select: { id: true, status: true, createdAt: true, updatedAt: true } },
        opportunities: { select: { id: true, stage: true, createdAt: true, updatedAt: true, currency: true } },
      },
    }),
    prisma.activity.findMany({
      where: {
        OR: [{ lead: { companyId } }, { contact: { companyId } }],
        occurredAt: { lte: asOf },
      },
      select: { occurredAt: true },
      orderBy: { occurredAt: 'desc' },
      take: 200,
    }),
  ]);

  if (!company) throw new CustomerLifecyclePolicyError(404, 'Company not found');

  const signalDates = [
    ...activities.map((activity) => activity.occurredAt),
    // Lead metadata timestamps are not customer interactions: a status or
    // notes update must not hide a genuine reactivation gap. Opportunity
    // creation/stage changes are commercial signals and remain included.
    ...company.opportunities.flatMap((opportunity) => [opportunity.createdAt, opportunity.updatedAt]),
  ]
    .filter((date) => date.getTime() <= asOf.getTime())
    .sort((left, right) => right.getTime() - left.getTime());
  const lastInteractionAt = signalDates[0] ?? null;
  const previousInteractionAt = signalDates[1] ?? null;
  const daysSinceLastInteraction = lastInteractionAt ? daysBetween(asOf, lastInteractionAt) : null;
  const wonOpportunities = company.opportunities.filter((opportunity) => opportunity.stage === 'WON');
  const hasCommercialHistory = company.leads.length > 0 || company.opportunities.length > 0 || activities.length > 0;
  const reactivated = Boolean(
    lastInteractionAt &&
      previousInteractionAt &&
      daysSinceLastInteraction !== null &&
      daysSinceLastInteraction <= ACTIVE_WINDOW_DAYS &&
      daysBetween(lastInteractionAt, previousInteractionAt) >= DORMANT_WINDOW_DAYS
  );

  let state: CustomerLifecycleState = 'NEW';
  if (reactivated) state = 'REACTIVATED';
  else if (daysSinceLastInteraction !== null && daysSinceLastInteraction > DORMANT_WINDOW_DAYS) state = 'DORMANT';
  else if (daysSinceLastInteraction !== null && daysSinceLastInteraction > ACTIVE_WINDOW_DAYS) state = 'COOLING';
  else if (wonOpportunities.length >= 2) state = 'REPEAT';
  else if (hasCommercialHistory) state = 'DEVELOPING';

  const currencySet = new Set(wonOpportunities.map((opportunity) => opportunity.currency).filter(Boolean));
  return {
    policyVersion: LIFECYCLE_POLICY_VERSION,
    companyId: company.id,
    asOf: asOf.toISOString(),
    state,
    signals: {
      leadCount: company.leads.length,
      activeLeadCount: company.leads.filter((lead) => !['DISQUALIFIED', 'CONVERTED'].includes(lead.status)).length,
      opportunityCount: company.opportunities.length,
      wonOpportunityCount: wonOpportunities.length,
      activityCount: activities.length,
      lastInteractionAt: lastInteractionAt?.toISOString() ?? null,
      daysSinceLastInteraction,
      reactivated,
      highValue: {
        classification: 'NOT_CLASSIFIED',
        reason: currencySet.size > 1 ? 'Multiple currencies require an explicit business policy' : 'Value threshold policy is not configured',
      },
    },
    policy: {
      activeWindowDays: ACTIVE_WINDOW_DAYS,
      dormantWindowDays: DORMANT_WINDOW_DAYS,
      maxActivitySignals: 200,
      writesPerformed: false,
      externalCallsPerformed: false,
    },
  };
}
