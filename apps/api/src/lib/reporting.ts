import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';

export const REPORT_TIMEZONE = 'Europe/Istanbul';
const ISTANBUL_OFFSET_MS = 3 * 60 * 60 * 1_000;
const SAFE_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const MAX_KEY_LENGTH = 128;
const MAX_INTEGER = 2_147_483_647;

const COMPANY_STATUSES = ['ACTIVE', 'ARCHIVED', 'MERGED'] as const;
const LEAD_STATUSES = ['NEW', 'QUALIFYING', 'QUALIFIED', 'DISQUALIFIED', 'CONVERTED'] as const;
const MISSION_STATUSES = ['ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'] as const;
const CANDIDATE_STATUSES = ['PROPOSED', 'NEEDS_MORE_EVIDENCE', 'ACCEPTED', 'REJECTED'] as const;
const JOB_STATUSES = ['QUEUED', 'RUNNING', 'RETRYABLE_FAILED', 'SUCCEEDED', 'DEAD_LETTER'] as const;
const DRAFT_STATUSES = ['DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED'] as const;

export class ReportingPolicyError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message);
    this.name = 'ReportingPolicyError';
  }
}

export type ReportWindow = {
  reportDate: string;
  timezone: typeof REPORT_TIMEZONE;
  periodStart: Date;
  periodEnd: Date;
};

export type ManagementReportMetrics = {
  window: { reportDate: string; timezone: typeof REPORT_TIMEZONE };
  companies: { created: number; byStatus: Record<string, number> };
  leads: { created: number; byStatus: Record<string, number> };
  research: {
    missionsCreated: number;
    missionsByStatus: Record<string, number>;
    candidatesCreated: number;
    candidatesByStatus: Record<string, number>;
    evidenceAdded: number;
  };
  jobs: { created: number; byStatus: Record<string, number>; attempts: number };
  outreach: { draftsCreated: number; draftsByStatus: Record<string, number> };
  events: { created: number };
  usage: {
    receipts: number;
    inputTokens: number;
    outputTokens: number;
    costMinorByCurrency: Record<string, number>;
  };
  safety: {
    sandboxProviderCalls: number;
    realExternalActionsRecorded: 0;
    unverifiedAiCalls: 0;
  };
};

type CanonicalJson = Prisma.JsonValue;

function canonicalize(value: unknown, path: string): CanonicalJson {
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new ReportingPolicyError(400, `${path} must be finite JSON`);
    return value;
  }
  if (Array.isArray(value)) return value.map((item, index) => canonicalize(item, `${path}[${index}]`));
  if (typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new ReportingPolicyError(400, `${path} must contain JSON values only`);
  }
  const sorted: Record<string, CanonicalJson> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    sorted[key] = canonicalize((value as Record<string, unknown>)[key], `${path}.${key}`);
  }
  return sorted;
}

function sha256Json(value: CanonicalJson) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function validateKey(value: string, label: string) {
  if (typeof value !== 'string' || value.length < 1 || value.length > MAX_KEY_LENGTH || !SAFE_KEY_PATTERN.test(value)) {
    throw new ReportingPolicyError(400, `Invalid ${label}`);
  }
}

function validateInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_INTEGER) {
    throw new ReportingPolicyError(400, `${label} must be a non-negative integer`);
  }
}

function assertDate(value: Date, label: string) {
  if (Number.isNaN(value.getTime())) throw new ReportingPolicyError(400, `Invalid ${label}`);
}

export function getCurrentReportDate(now = new Date()) {
  assertDate(now, 'now');
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: REPORT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function getReportWindow(reportDate: string): ReportWindow {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) {
    throw new ReportingPolicyError(400, 'date must use YYYY-MM-DD format');
  }
  const [year, month, day] = reportDate.split('-').map(Number);
  const utcMidnight = new Date(Date.UTC(year, month - 1, day));
  if (
    utcMidnight.getUTCFullYear() !== year ||
    utcMidnight.getUTCMonth() !== month - 1 ||
    utcMidnight.getUTCDate() !== day
  ) {
    throw new ReportingPolicyError(400, 'date is not a valid calendar date');
  }
  const periodStart = new Date(utcMidnight.getTime() - ISTANBUL_OFFSET_MS);
  return {
    reportDate,
    timezone: REPORT_TIMEZONE,
    periodStart,
    periodEnd: new Date(periodStart.getTime() + 24 * 60 * 60 * 1_000),
  };
}

async function countStatuses<T extends string>(
  statuses: readonly T[],
  count: (status: T) => Promise<number>
) {
  const result: Record<string, number> = {};
  for (const status of statuses) result[status] = await count(status);
  return result;
}

async function collectMetrics(window: ReportWindow): Promise<ManagementReportMetrics> {
  const { periodStart, periodEnd } = window;
  return prisma.$transaction(async (tx) => {
    const [
      companiesCreated,
      leadsCreated,
      missionsCreated,
      candidatesCreated,
      evidenceAdded,
      eventsCreated,
      draftsCreated,
      sandboxProviderCalls,
      jobsCreated,
      attempts,
      usageRows,
    ] = await Promise.all([
      tx.company.count({ where: { createdAt: { gte: periodStart, lt: periodEnd } } }),
      tx.lead.count({ where: { createdAt: { gte: periodStart, lt: periodEnd } } }),
      tx.researchMission.count({ where: { createdAt: { gte: periodStart, lt: periodEnd } } }),
      tx.researchCandidate.count({ where: { createdAt: { gte: periodStart, lt: periodEnd } } }),
      tx.evidence.count({ where: { createdAt: { gte: periodStart, lt: periodEnd } } }),
      tx.event.count({ where: { createdAt: { gte: periodStart, lt: periodEnd } } }),
      tx.outreachDraft.count({ where: { createdAt: { gte: periodStart, lt: periodEnd } } }),
      tx.sendAttempt.count({ where: { createdAt: { gte: periodStart, lt: periodEnd }, providerCallPerformed: true } }),
      tx.job.count({ where: { createdAt: { gte: periodStart, lt: periodEnd } } }),
      tx.job.aggregate({ where: { createdAt: { gte: periodStart, lt: periodEnd } }, _sum: { attempts: true } }),
      tx.usageReceipt.findMany({
        where: { occurredAt: { gte: periodStart, lt: periodEnd } },
        select: { currency: true, costMinor: true, inputTokens: true, outputTokens: true },
      }),
    ]);

    const [companyByStatus, leadByStatus, missionByStatus, candidateByStatus, jobByStatus, draftByStatus] = await Promise.all([
      countStatuses(COMPANY_STATUSES, (status) => tx.company.count({ where: { status } })),
      countStatuses(LEAD_STATUSES, (status) => tx.lead.count({ where: { status, createdAt: { gte: periodStart, lt: periodEnd } } })),
      countStatuses(MISSION_STATUSES, (status) => tx.researchMission.count({ where: { status, createdAt: { gte: periodStart, lt: periodEnd } } })),
      countStatuses(CANDIDATE_STATUSES, (status) => tx.researchCandidate.count({ where: { status, createdAt: { gte: periodStart, lt: periodEnd } } })),
      countStatuses(JOB_STATUSES, (status) => tx.job.count({ where: { status, createdAt: { gte: periodStart, lt: periodEnd } } })),
      countStatuses(DRAFT_STATUSES, (status) => tx.outreachDraft.count({ where: { status, createdAt: { gte: periodStart, lt: periodEnd } } })),
    ]);

    const costMinorByCurrency: Record<string, number> = {};
    let inputTokens = 0;
    let outputTokens = 0;
    for (const row of usageRows) {
      costMinorByCurrency[row.currency] = (costMinorByCurrency[row.currency] ?? 0) + row.costMinor;
      inputTokens += row.inputTokens;
      outputTokens += row.outputTokens;
    }

    return {
      window: { reportDate: window.reportDate, timezone: window.timezone },
      companies: { created: companiesCreated, byStatus: companyByStatus },
      leads: { created: leadsCreated, byStatus: leadByStatus },
      research: {
        missionsCreated,
        missionsByStatus: missionByStatus,
        candidatesCreated,
        candidatesByStatus: candidateByStatus,
        evidenceAdded,
      },
      jobs: { created: jobsCreated, byStatus: jobByStatus, attempts: attempts._sum.attempts ?? 0 },
      outreach: { draftsCreated, draftsByStatus: draftByStatus },
      events: { created: eventsCreated },
      usage: {
        receipts: usageRows.length,
        inputTokens,
        outputTokens,
        costMinorByCurrency,
      },
      safety: {
        sandboxProviderCalls,
        realExternalActionsRecorded: 0,
        unverifiedAiCalls: 0,
      },
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function recordUsageReceipt(input: {
  provider: string;
  model: string;
  operation: string;
  idempotencyKey: string;
  inputTokens?: number;
  outputTokens?: number;
  costMinor?: number;
  currency?: string;
  occurredAt?: Date;
  metadata?: unknown;
}) {
  validateKey(input.provider, 'provider');
  validateKey(input.model, 'model');
  validateKey(input.operation, 'operation');
  validateKey(input.idempotencyKey, 'idempotency key');
  const inputTokens = input.inputTokens ?? 0;
  const outputTokens = input.outputTokens ?? 0;
  const costMinor = input.costMinor ?? 0;
  validateInteger(inputTokens, 'inputTokens');
  validateInteger(outputTokens, 'outputTokens');
  validateInteger(costMinor, 'costMinor');
  const currency = input.currency ?? 'USD';
  if (!/^[A-Z]{3}$/.test(currency)) throw new ReportingPolicyError(400, 'currency must be an ISO-like uppercase code');
  const occurredAt = input.occurredAt ?? new Date();
  assertDate(occurredAt, 'occurredAt');
  const metadata = input.metadata === undefined ? null : canonicalize(input.metadata, 'metadata');
  const metadataText = metadata === null ? '' : JSON.stringify(metadata);
  if (/(?:sk|re)_[A-Za-z0-9_-]{12,}|bearer\s+[A-Za-z0-9._-]{12,}/i.test(metadataText)) {
    throw new ReportingPolicyError(400, 'metadata contains credential-shaped data');
  }
  const receiptFields = {
    provider: input.provider,
    model: input.model,
    operation: input.operation,
    idempotencyKey: input.idempotencyKey,
    inputTokens,
    outputTokens,
    costMinor,
    currency,
    occurredAt: occurredAt.toISOString(),
    metadata,
  };
  const receiptHash = sha256Json(receiptFields);

  try {
    return await prisma.usageReceipt.create({
      data: {
        provider: input.provider,
        model: input.model,
        operation: input.operation,
        idempotencyKey: input.idempotencyKey,
        receiptHash,
        inputTokens,
        outputTokens,
        costMinor,
        currency,
        occurredAt,
        metadata: metadata as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
    const existing = await prisma.usageReceipt.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (!existing) throw error;
    if (existing.receiptHash !== receiptHash) {
      // A generated timestamp is not part of a retry's caller-owned identity.
      // When occurredAt was omitted, compare the immutable fields against the
      // original stored timestamp before declaring a payload conflict.
      const retryHash = sha256Json({ ...receiptFields, occurredAt: existing.occurredAt.toISOString() });
      if (input.occurredAt || existing.receiptHash !== retryHash) {
        throw new ReportingPolicyError(409, 'Idempotency key already identifies a different usage receipt');
      }
    }
    return existing;
  }
}

export async function generateManagementReport(reportDate = getCurrentReportDate()) {
  const window = getReportWindow(reportDate);
  const metrics = await collectMetrics(window);
  const inputHash = sha256Json(metrics as unknown as CanonicalJson);
  const reportKey = `${window.reportDate}:${window.timezone}`;
  const existing = await prisma.managementReport.findUnique({ where: { reportKey } });
  if (existing?.inputHash === inputHash) return { report: existing, reused: true };

  const report = await prisma.managementReport.upsert({
    where: { reportKey },
    create: {
      reportKey,
      reportDate: window.reportDate,
      timezone: window.timezone,
      periodStart: window.periodStart,
      periodEnd: window.periodEnd,
      inputHash,
      metrics: metrics as unknown as Prisma.InputJsonValue,
    },
    update: {
      periodStart: window.periodStart,
      periodEnd: window.periodEnd,
      inputHash,
      metrics: metrics as unknown as Prisma.InputJsonValue,
      generatedAt: new Date(),
    },
  });
  return { report, reused: false };
}
