import { prisma } from './prisma';

export const COMPANY_INTELLIGENCE_POLICY_VERSION = 'company-intelligence-timeline-v1';
export const MAX_COMPANY_INTELLIGENCE_LIMIT = 100;
export const MAX_COMPANY_INTELLIGENCE_WINDOW_DAYS = 366;
const DAY_MS = 86_400_000;
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/;

export class CompanyIntelligencePolicyError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message);
    this.name = 'CompanyIntelligencePolicyError';
  }
}

function validateCompanyId(companyId: string) {
  if (typeof companyId !== 'string' || companyId.length < 1 || companyId.length > 128 || !SAFE_ID_PATTERN.test(companyId)) {
    throw new CompanyIntelligencePolicyError(400, 'Invalid company id');
  }
}

function validateDate(value: Date, label: string) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new CompanyIntelligencePolicyError(400, `Invalid ${label}`);
  }
  if (value.getTime() > Date.now() + 5 * 60 * 1000) {
    throw new CompanyIntelligencePolicyError(400, `${label} cannot be in the future`);
  }
}

function validateLimit(limit: number) {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_COMPANY_INTELLIGENCE_LIMIT) {
    throw new CompanyIntelligencePolicyError(400, `limit must be an integer between 1 and ${MAX_COMPANY_INTELLIGENCE_LIMIT}`);
  }
}

/**
 * Return a bounded, metadata-free company event timeline from local receipts.
 * This projection never performs network I/O and never writes application state.
 */
export async function getCompanyIntelligenceTimeline(input: {
  companyId: string;
  from?: Date;
  to?: Date;
  limit?: number;
}) {
  validateCompanyId(input.companyId);
  const to = input.to ?? new Date();
  const from = input.from ?? new Date(to.getTime() - 90 * DAY_MS);
  const limit = input.limit ?? 50;
  validateDate(from, 'from');
  validateDate(to, 'to');
  validateLimit(limit);
  if (from.getTime() >= to.getTime()) {
    throw new CompanyIntelligencePolicyError(400, 'from must be earlier than to');
  }
  if (to.getTime() - from.getTime() > MAX_COMPANY_INTELLIGENCE_WINDOW_DAYS * DAY_MS) {
    throw new CompanyIntelligencePolicyError(400, `window cannot exceed ${MAX_COMPANY_INTELLIGENCE_WINDOW_DAYS} days`);
  }

  const company = await prisma.company.findUnique({
    where: { id: input.companyId },
    select: { id: true, name: true, status: true, country: true, city: true, sector: true },
  });
  if (!company) throw new CompanyIntelligencePolicyError(404, 'Company not found');

  const eventWhere = {
    entityType: 'Company',
    entityId: company.id,
    occurredAt: { gte: from, lt: to },
  } as const;
  const [events, totalEvents, totalEvidence, eventTypeGroups] = await Promise.all([
    prisma.event.findMany({
      where: eventWhere,
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: {
        id: true,
        type: true,
        actor: true,
        occurredAt: true,
        _count: { select: { evidences: true } },
      },
    }),
    prisma.event.count({ where: eventWhere }),
    prisma.evidence.count({ where: { event: eventWhere } }),
    prisma.event.groupBy({
      by: ['type'],
      where: eventWhere,
      _count: { _all: true },
    }),
  ]);

  return {
    policyVersion: COMPANY_INTELLIGENCE_POLICY_VERSION,
    company,
    window: { from: from.toISOString(), to: to.toISOString() },
    summary: {
      totalEvents,
      totalEvidence,
      eventTypeCounts: Object.fromEntries(
        eventTypeGroups.sort((left, right) => left.type.localeCompare(right.type)).map((group) => [group.type, group._count._all]),
      ),
    },
    events: events.map((event) => ({
      id: event.id,
      type: event.type,
      actor: event.actor,
      occurredAt: event.occurredAt.toISOString(),
      evidenceCount: event._count.evidences,
    })),
    policy: {
      maxLimit: MAX_COMPANY_INTELLIGENCE_LIMIT,
      maxWindowDays: MAX_COMPANY_INTELLIGENCE_WINDOW_DAYS,
      metadataIncluded: false,
      writesPerformed: false,
      externalCallsPerformed: false,
    },
  };
}
