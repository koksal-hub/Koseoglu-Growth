import { prisma } from './prisma';

export const LIFECYCLE_POLICY_VERSION = 'customer-lifecycle-signals-v2';
export const ACTIVE_WINDOW_DAYS = 30;
export const DORMANT_WINDOW_DAYS = 90;

/**
 * BC4: the v1 policy returned REPEAT for two won opportunities. A won
 * opportunity is a pipeline label - a commercial belief entered in the CRM - not
 * a delivery record, so it cannot prove that anything was actually shipped.
 *
 * REPEAT is therefore a claim about *shipped* business and may only be derived
 * from operations shipment truth (distinct verified shipments). This schema has
 * no company-scoped shipment source yet: RecommendationOutcome (the only place a
 * WON_SHIPMENT fact can live) hangs off a polymorphic exposure without a
 * companyId, and no Shipment model exists. Until L6 wires MYLojistik shipment
 * receipts, REPEAT stays unreachable and the response names the missing
 * dependency through `signals.repeatEvidence` instead of guessing.
 */
export const REPEAT_PIPELINE_WON_THRESHOLD = 2;

export type RepeatEvidenceBasis = 'PIPELINE_ONLY_UNCONFIRMED' | 'INSUFFICIENT';

/** Capability gap, deliberately not a number: a missing source is not zero shipments. */
export type OperationsShipmentSource = 'NOT_AVAILABLE';

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

/**
 * Read-only lifecycle classification for one company.
 *
 * Policy v2 (BC4): REPEAT requires operations shipment truth. Pipeline labels
 * (Opportunity.stage = WON) are commercial beliefs and stay reported as signals,
 * but they never establish REPEAT on their own; a pipeline-only double win is
 * DEVELOPING with `signals.repeatEvidence.basis = 'PIPELINE_ONLY_UNCONFIRMED'`.
 *
 * No writes and no external calls are performed by this function.
 */
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
  // BC4: no REPEAT branch here on purpose. REPEAT asserts shipped repeat
  // business, and no operations shipment source exists yet (see the policy note
  // above), so a pipeline-only double win is reported as DEVELOPING plus an
  // explicit repeatEvidence basis. When L6 lands shipment receipts this is the
  // single place that must consult them.
  else if (hasCommercialHistory) state = 'DEVELOPING';

  const repeatBasis: RepeatEvidenceBasis =
    wonOpportunities.length >= REPEAT_PIPELINE_WON_THRESHOLD ? 'PIPELINE_ONLY_UNCONFIRMED' : 'INSUFFICIENT';
  const operationsShipmentSource: OperationsShipmentSource = 'NOT_AVAILABLE';

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
      // BC4: REPEAT is a claim about shipped business, so the response always
      // states the basis of that claim instead of leaving it implicit.
      repeatEvidence: {
        basis: repeatBasis,
        pipelineWonCount: wonOpportunities.length,
        pipelineWonThreshold: REPEAT_PIPELINE_WON_THRESHOLD,
        operationsShipmentSource
      },
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
      repeatRequiresShippedEvidence: true,
      writesPerformed: false,
      externalCallsPerformed: false,
    },
  };
}
