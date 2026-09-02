import { Prisma, type RecommendationExposureMode, type RecommendationOutcomeSourceType, type RecommendationOutcomeType, type RecommendationType } from '@prisma/client';
import { prisma } from './prisma';

export const RECOMMENDATION_MEASUREMENT_POLICY_VERSION = 'recommendation-measurement-v1';
export const MAX_RECOMMENDATION_POSITION = 100;
export const MAX_MEASUREMENT_LIST_LIMIT = 100;

const SAFE_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/i;
const CREDENTIAL_PATTERN = /(?:sk|re)_[A-Za-z0-9_-]{12,}|bearer\s+[A-Za-z0-9._-]{12,}/i;

export class RecommendationMeasurementError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message);
    this.name = 'RecommendationMeasurementError';
  }
}

function validateKey(value: string, label: string, maxLength = 128) {
  if (typeof value !== 'string' || value.length < 1 || value.length > maxLength || !SAFE_KEY_PATTERN.test(value)) {
    throw new RecommendationMeasurementError(400, `Invalid ${label}`);
  }
}

function validateDate(value: Date, label: string) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new RecommendationMeasurementError(400, `Invalid ${label}`);
  }
  if (value.getTime() > Date.now() + 5 * 60 * 1000) {
    throw new RecommendationMeasurementError(400, `${label} cannot be in the future`);
  }
}

function validateHash(value: string, label: string) {
  if (typeof value !== 'string' || !HASH_PATTERN.test(value)) {
    throw new RecommendationMeasurementError(400, `${label} must be a SHA-256 hex hash`);
  }
}

function validateEnum(value: string, allowed: readonly string[], label: string) {
  if (!allowed.includes(value)) throw new RecommendationMeasurementError(400, `Unsupported ${label}`);
}

function validateSourceRef(value: string | undefined) {
  if (value === undefined) return;
  validateKey(value, 'source reference', 256);
  if (CREDENTIAL_PATTERN.test(value)) throw new RecommendationMeasurementError(400, 'source reference contains credential-shaped data');
}

function sameExposurePayload(
  existing: {
    recommendationType: RecommendationType;
    recommendationId: string;
    algorithmVersion: string;
    inputHash: string;
    mode: RecommendationExposureMode;
    position: number;
    actor: string;
    exposedAt: Date;
  },
  input: {
    recommendationType: RecommendationType;
    recommendationId: string;
    algorithmVersion: string;
    inputHash: string;
    mode: RecommendationExposureMode;
    position: number;
    actor: string;
    exposedAt: Date;
  }
) {
  return (
    existing.recommendationType === input.recommendationType &&
    existing.recommendationId === input.recommendationId &&
    existing.algorithmVersion === input.algorithmVersion &&
    existing.inputHash === input.inputHash &&
    existing.mode === input.mode &&
    existing.position === input.position &&
    existing.actor === input.actor &&
    existing.exposedAt.getTime() === input.exposedAt.getTime()
  );
}

export async function recordRecommendationExposure(input: {
  exposureKey: string;
  recommendationType: string;
  recommendationId: string;
  algorithmVersion: string;
  inputHash: string;
  mode: string;
  position: number;
  actor: string;
  exposedAt: Date;
}) {
  validateKey(input.exposureKey, 'exposure key');
  validateEnum(input.recommendationType, ['LEAD_RANKING', 'RESEARCH_ACTION'], 'recommendation type');
  validateKey(input.recommendationId, 'recommendation id');
  validateKey(input.algorithmVersion, 'algorithm version');
  validateHash(input.inputHash, 'inputHash');
  validateEnum(input.mode, ['EXPLOITATION', 'EXPLORATION'], 'exposure mode');
  if (!Number.isInteger(input.position) || input.position < 1 || input.position > MAX_RECOMMENDATION_POSITION) {
    throw new RecommendationMeasurementError(400, `position must be an integer between 1 and ${MAX_RECOMMENDATION_POSITION}`);
  }
  validateKey(input.actor, 'actor');
  validateDate(input.exposedAt, 'exposedAt');

  try {
    const exposure = await prisma.recommendationExposure.create({
      data: {
        exposureKey: input.exposureKey,
        recommendationType: input.recommendationType as RecommendationType,
        recommendationId: input.recommendationId,
        algorithmVersion: input.algorithmVersion,
        inputHash: input.inputHash.toLowerCase(),
        mode: input.mode as RecommendationExposureMode,
        position: input.position,
        actor: input.actor,
        exposedAt: input.exposedAt
      },
      include: { outcomes: true }
    });
    return { exposure, reused: false };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
    const existing = await prisma.recommendationExposure.findUnique({ where: { exposureKey: input.exposureKey }, include: { outcomes: true } });
    if (!existing) throw error;
    const normalizedInput = {
      recommendationType: input.recommendationType as RecommendationType,
      recommendationId: input.recommendationId,
      algorithmVersion: input.algorithmVersion,
      inputHash: input.inputHash.toLowerCase(),
      mode: input.mode as RecommendationExposureMode,
      position: input.position,
      actor: input.actor,
      exposedAt: input.exposedAt
    };
    if (!sameExposurePayload(existing, normalizedInput)) {
      throw new RecommendationMeasurementError(409, 'exposureKey already exists with a different payload');
    }
    return { exposure: existing, reused: true };
  }
}

export async function listRecommendationExposures(input: {
  limit?: number;
  recommendationType?: RecommendationType;
  recommendationId?: string;
} = {}) {
  const limit = input.limit ?? MAX_MEASUREMENT_LIST_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_MEASUREMENT_LIST_LIMIT) {
    throw new RecommendationMeasurementError(400, `limit must be an integer between 1 and ${MAX_MEASUREMENT_LIST_LIMIT}`);
  }
  if (input.recommendationId !== undefined) validateKey(input.recommendationId, 'recommendation id');
  return prisma.recommendationExposure.findMany({
    where: { recommendationType: input.recommendationType, recommendationId: input.recommendationId },
    include: { outcomes: { orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }] } },
    orderBy: [{ exposedAt: 'desc' }, { id: 'asc' }],
    take: limit
  });
}

function sameOutcomePayload(
  existing: {
    outcomeType: RecommendationOutcomeType;
    occurredAt: Date;
    valueMinor: number | null;
    currency: string | null;
    sourceRef: string | null;
    sourceType: RecommendationOutcomeSourceType | null;
    sourceId: string | null;
    recordedBy: string;
  },
  input: {
    outcomeType: RecommendationOutcomeType;
    occurredAt: Date;
    valueMinor: number | null;
    currency: string | null;
    sourceRef: string | null;
    sourceType: RecommendationOutcomeSourceType | null;
    sourceId: string | null;
    recordedBy: string;
  }
) {
  return (
    existing.outcomeType === input.outcomeType &&
    existing.occurredAt.getTime() === input.occurredAt.getTime() &&
    existing.valueMinor === input.valueMinor &&
    existing.currency === input.currency &&
    existing.sourceRef === input.sourceRef &&
    existing.sourceType === input.sourceType &&
    existing.sourceId === input.sourceId &&
    existing.recordedBy === input.recordedBy
  );
}

async function assertLocalOutcomeSourceExists(
  sourceType: RecommendationOutcomeSourceType | null,
  sourceId: string | null
) {
  if (!sourceType || !sourceId || sourceType === 'HUMAN_NOTE' || sourceType === 'OPERATIONS_RECORD') return;
  const exists =
    sourceType === 'CRM_LEAD'
      ? await prisma.lead.findUnique({ where: { id: sourceId }, select: { id: true } })
      : sourceType === 'CRM_OPPORTUNITY'
        ? await prisma.opportunity.findUnique({ where: { id: sourceId }, select: { id: true } })
        : await prisma.event.findUnique({ where: { id: sourceId }, select: { id: true } });
  if (!exists) throw new RecommendationMeasurementError(404, `${sourceType} source not found`);
}

export async function recordRecommendationOutcome(input: {
  exposureId: string;
  outcomeKey: string;
  outcomeType: string;
  occurredAt: Date;
  valueMinor?: number;
  currency?: string;
  sourceRef?: string;
  sourceType?: string;
  sourceId?: string;
  recordedBy: string;
}) {
  validateKey(input.exposureId, 'exposure id');
  validateKey(input.outcomeKey, 'outcome key');
  validateEnum(input.outcomeType, ['HUMAN_ACTION', 'LEAD_CREATED', 'QUOTE_REQUESTED', 'WON_SHIPMENT', 'GROSS_PROFIT'], 'outcome type');
  validateDate(input.occurredAt, 'occurredAt');
  validateKey(input.recordedBy, 'recorded by');
  validateSourceRef(input.sourceRef);
  if (input.sourceType !== undefined) validateEnum(input.sourceType, ['CRM_LEAD', 'CRM_OPPORTUNITY', 'CRM_EVENT', 'HUMAN_NOTE', 'OPERATIONS_RECORD'], 'outcome source type');
  if (input.sourceId !== undefined) validateKey(input.sourceId, 'outcome source id');
  if ((input.sourceType === undefined) !== (input.sourceId === undefined)) {
    throw new RecommendationMeasurementError(400, 'sourceType and sourceId must be provided together');
  }
  if (input.valueMinor !== undefined && (!Number.isInteger(input.valueMinor) || input.valueMinor < 0 || input.valueMinor > 2_000_000_000)) {
    throw new RecommendationMeasurementError(400, 'valueMinor must be a non-negative integer within the supported range');
  }
  const valueMinor = input.valueMinor ?? null;
  const currency = input.currency?.trim().toUpperCase() ?? null;
  if (currency !== null && !/^[A-Z]{3}$/.test(currency)) {
    throw new RecommendationMeasurementError(400, 'currency must be a 3-letter code');
  }
  if (valueMinor === null && currency !== null) throw new RecommendationMeasurementError(400, 'currency requires valueMinor');
  if (valueMinor !== null && currency === null) throw new RecommendationMeasurementError(400, 'valueMinor requires currency');
  if (input.outcomeType === 'GROSS_PROFIT' && (valueMinor === null || currency === null)) {
    throw new RecommendationMeasurementError(400, 'GROSS_PROFIT requires valueMinor and currency');
  }

  const exposure = await prisma.recommendationExposure.findUnique({ where: { id: input.exposureId } });
  if (!exposure) throw new RecommendationMeasurementError(404, 'Recommendation exposure not found');
  const normalizedSourceType = input.sourceType ? (input.sourceType as RecommendationOutcomeSourceType) : null;
  const normalizedSourceId = input.sourceId ?? null;
  const data = {
    exposureId: input.exposureId,
    outcomeKey: input.outcomeKey,
    outcomeType: input.outcomeType as RecommendationOutcomeType,
    occurredAt: input.occurredAt,
    valueMinor,
    currency,
    sourceRef: input.sourceRef ?? null,
    sourceType: normalizedSourceType,
    sourceId: normalizedSourceId,
    recordedBy: input.recordedBy
  };
  const existingOutcome = await prisma.recommendationOutcome.findUnique({
    where: { exposureId_outcomeKey: { exposureId: input.exposureId, outcomeKey: input.outcomeKey } }
  });
  if (existingOutcome) {
    if (!sameOutcomePayload(existingOutcome, data)) {
      throw new RecommendationMeasurementError(409, 'outcomeKey already exists with a different payload');
    }
    return { outcome: existingOutcome, reused: true };
  }
  await assertLocalOutcomeSourceExists(normalizedSourceType, normalizedSourceId);
  try {
    const outcome = await prisma.recommendationOutcome.create({ data });
    return { outcome, reused: false };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
    const existing = await prisma.recommendationOutcome.findUnique({
      where: { exposureId_outcomeKey: { exposureId: input.exposureId, outcomeKey: input.outcomeKey } }
    });
    if (!existing) throw error;
    if (!sameOutcomePayload(existing, data)) {
      throw new RecommendationMeasurementError(409, 'outcomeKey already exists with a different payload');
    }
    return { outcome: existing, reused: true };
  }
}
