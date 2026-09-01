import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { enqueueJob } from './job-queue';

export const SOCIAL_CONTENT_POLICY_VERSION = 'social-content-policy-v1';

// Product guardrails are deliberately conservative and versioned. They are
// not claims about a provider's current API limits; concrete adapters must
// perform their own current validation before any future publish capability.
export const PLATFORM_CONTENT_LIMITS = Object.freeze({
  LINKEDIN: 3_000,
  INSTAGRAM: 2_200,
  FACEBOOK: 2_000,
  X: 280,
  THREADS: 500,
  TIKTOK: 2_200,
  YOUTUBE: 5_000,
  GOOGLE_BUSINESS: 1_500,
  PINTEREST: 500,
} as const);

const SAFE_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const CREDENTIAL_PATTERN = /(?:sk|re)_[A-Za-z0-9_-]{12,}|bearer\s+[A-Za-z0-9._-]{12,}/i;

export type SocialPlatform = keyof typeof PLATFORM_CONTENT_LIMITS;

export class SocialContentPolicyError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message);
    this.name = 'SocialContentPolicyError';
  }
}

export type SocialProviderAdapter = {
  readonly platform: SocialPlatform;
  connect(input: { accountKey: string }): Promise<void>;
  refreshToken(): Promise<void>;
  validateContent(input: { body: string; mediaManifest?: unknown }): Promise<{ valid: boolean; reasons: string[] }>;
  uploadMedia(input: { mediaManifest: unknown }): Promise<{ mediaReference: string }>;
  publish(input: { body: string; mediaReference?: string }): Promise<{ providerPostId: string }>;
  schedule(input: { body: string; scheduledAt: Date; mediaReference?: string }): Promise<{ providerPostId: string }>;
  delete(input: { providerPostId: string }): Promise<void>;
  fetchPostMetrics(input: { providerPostId: string }): Promise<unknown>;
  fetchComments(input: { providerPostId: string }): Promise<unknown>;
  fetchMessages(input: { accountKey: string }): Promise<unknown>;
};

const adapters = new Map<SocialPlatform, SocialProviderAdapter>();

function validateKey(value: string, label: string) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 128 || !SAFE_KEY_PATTERN.test(value)) {
    throw new SocialContentPolicyError(400, `Invalid ${label}`);
  }
}

function canonicalize(value: unknown, path: string): Prisma.JsonValue {
  if (value === null) return null;
  if (typeof value === 'string') {
    if (CREDENTIAL_PATTERN.test(value)) throw new SocialContentPolicyError(400, `${path} contains credential-shaped data`);
    return value;
  }
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new SocialContentPolicyError(400, `${path} must be finite JSON`);
    return value;
  }
  if (Array.isArray(value)) return value.map((item, index) => canonicalize(item, `${path}[${index}]`));
  if (typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new SocialContentPolicyError(400, `${path} must contain JSON values only`);
  }
  const sorted: Record<string, Prisma.JsonValue> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    if (/password|secret|token|authorization|cookie|api.?key/i.test(key)) {
      throw new SocialContentPolicyError(400, `${path}.${key} is not allowed`);
    }
    sorted[key] = canonicalize((value as Record<string, unknown>)[key], `${path}.${key}`);
  }
  return sorted;
}

function sha256(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function assertPlatform(platform: string): asserts platform is SocialPlatform {
  if (!(platform in PLATFORM_CONTENT_LIMITS)) throw new SocialContentPolicyError(400, 'Unsupported social platform');
}

export function assertIndependentReviewer(author: string, reviewer: string) {
  validateKey(author, 'author');
  validateKey(reviewer, 'reviewer');
  if (author === reviewer) throw new SocialContentPolicyError(409, 'Content author cannot approve their own content');
}

export function validateSocialVariant(input: {
  platform: string;
  body: string;
  mediaManifest?: unknown;
}) {
  assertPlatform(input.platform);
  if (typeof input.body !== 'string' || input.body.trim().length < 1) {
    throw new SocialContentPolicyError(400, 'Variant body is required');
  }
  const body = input.body.trim();
  const maxCharacters = PLATFORM_CONTENT_LIMITS[input.platform];
  if (body.length > maxCharacters) {
    throw new SocialContentPolicyError(400, `${input.platform} variant exceeds the product policy character limit`);
  }
  const mediaManifest = input.mediaManifest === undefined ? null : canonicalize(input.mediaManifest, 'mediaManifest');
  const serializedManifest = mediaManifest === null ? '' : JSON.stringify(mediaManifest);
  if (serializedManifest.length > 8_000) throw new SocialContentPolicyError(400, 'mediaManifest is too large');
  const contentHash = sha256(JSON.stringify({ body, mediaManifest }));
  return {
    platform: input.platform,
    body,
    mediaManifest,
    contentHash,
    policyVersion: SOCIAL_CONTENT_POLICY_VERSION,
    validationReceipt: {
      policyVersion: SOCIAL_CONTENT_POLICY_VERSION,
      platform: input.platform,
      bodyLength: body.length,
      maxCharacters,
      mediaManifestPresent: mediaManifest !== null,
      providerValidation: 'NOT_RUN',
    },
  };
}

export async function createSocialConnection(input: {
  platform: string;
  accountKey: string;
  accountLabel?: string;
  secretManagerRef?: string;
  scopes?: unknown;
}) {
  assertPlatform(input.platform);
  validateKey(input.accountKey, 'account key');
  if (input.secretManagerRef && (!/^vault:\/\/[A-Za-z0-9._:/-]+$/.test(input.secretManagerRef) || CREDENTIAL_PATTERN.test(input.secretManagerRef))) {
    throw new SocialContentPolicyError(400, 'secretManagerRef must be an opaque vault reference');
  }
  const scopes = input.scopes === undefined ? null : canonicalize(input.scopes, 'scopes');
  try {
    return await prisma.socialConnection.create({
      data: {
        platform: input.platform,
        accountKey: input.accountKey,
        accountLabel: input.accountLabel?.trim() || null,
        secretManagerRef: input.secretManagerRef ?? null,
        scopes: scopes as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
    const existing = await prisma.socialConnection.findFirst({ where: { platform: input.platform, accountKey: input.accountKey } });
    if (!existing) throw error;
    return existing;
  }
}

type SocialConnectionStatusValue = 'DISCONNECTED' | 'CONNECTED' | 'REAUTH_REQUIRED' | 'REVOKED';

const SOCIAL_CONNECTION_STATUS_TRANSITIONS: Record<SocialConnectionStatusValue, readonly SocialConnectionStatusValue[]> = {
  DISCONNECTED: ['REAUTH_REQUIRED'],
  CONNECTED: ['DISCONNECTED', 'REAUTH_REQUIRED', 'REVOKED'],
  REAUTH_REQUIRED: ['DISCONNECTED', 'REVOKED'],
  REVOKED: ['DISCONNECTED'],
};

export async function listSocialConnections(limit = 100) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new SocialContentPolicyError(400, 'limit must be an integer between 1 and 100');
  }
  return prisma.socialConnection.findMany({
    orderBy: [{ platform: 'asc' }, { accountKey: 'asc' }],
    take: limit,
    select: {
      id: true,
      platform: true,
      accountKey: true,
      accountLabel: true,
      status: true,
      scopes: true,
      tokenExpiresAt: true,
      lastValidatedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

/**
 * Change only provider-reported non-connected states from the private API.
 * CONNECTED must be established by a future adapter after real validation;
 * accepting it from an unauthenticated route would create a false readiness signal.
 */
export async function transitionSocialConnection(id: string, status: SocialConnectionStatusValue) {
  validateKey(id, 'social connection id');
  if (!Object.prototype.hasOwnProperty.call(SOCIAL_CONNECTION_STATUS_TRANSITIONS, status)) {
    throw new SocialContentPolicyError(400, 'Unsupported social connection status');
  }
  if (status === 'CONNECTED') {
    throw new SocialContentPolicyError(409, 'CONNECTED requires external adapter validation');
  }
  const current = await prisma.socialConnection.findUnique({ where: { id } });
  if (!current) throw new SocialContentPolicyError(404, 'Social connection not found');
  if (current.status === status) return current;
  if (!SOCIAL_CONNECTION_STATUS_TRANSITIONS[current.status].includes(status)) {
    throw new SocialContentPolicyError(409, `Cannot transition social connection from ${current.status} to ${status}`);
  }
  return prisma.socialConnection.update({ where: { id }, data: { status } });
}

/**
 * Report all blockers before a future publish worker could call a provider.
 * This function never performs network I/O and intentionally never reports
 * ready while concrete publish execution remains disabled.
 */
export async function evaluateSocialPublishReadiness(variantId: string) {
  validateKey(variantId, 'social variant id');
  const variant = await prisma.socialContentVariant.findUnique({ where: { id: variantId } });
  if (!variant) throw new SocialContentPolicyError(404, 'Social variant not found');

  const blockers: string[] = [];
  if (variant.status !== 'SCHEDULED') blockers.push('VARIANT_NOT_SCHEDULED');
  const connection = await prisma.socialConnection.findFirst({
    where: { platform: variant.platform, status: 'CONNECTED' },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, accountKey: true, status: true },
  });
  if (!connection) blockers.push('NO_CONNECTED_ACCOUNT');
  let adapterRegistered = true;
  try {
    getSocialAdapter(variant.platform);
  } catch (error) {
    if (!(error instanceof SocialContentPolicyError) || error.statusCode !== 503) throw error;
    adapterRegistered = false;
    blockers.push('NO_PROVIDER_ADAPTER');
  }
  blockers.push('PUBLISH_EXECUTION_DISABLED');
  return {
    ready: false,
    variantId: variant.id,
    platform: variant.platform,
    adapterRegistered,
    connection: connection ? { id: connection.id, accountKey: connection.accountKey } : null,
    blockers,
  };
}

export async function createMasterContent(input: {
  title: string;
  body: string;
  campaignKey?: string;
  author: string;
}) {
  if (input.title.trim().length < 1 || input.title.trim().length > 200) {
    throw new SocialContentPolicyError(400, 'Master content title must be 1-200 characters');
  }
  if (input.body.trim().length < 1 || input.body.trim().length > 20_000) {
    throw new SocialContentPolicyError(400, 'Master content body must be 1-20000 characters');
  }
  validateKey(input.author, 'author');
  if (input.campaignKey) validateKey(input.campaignKey, 'campaign key');
  return prisma.masterContent.create({
    data: {
      title: input.title.trim(),
      body: input.body.trim(),
      campaignKey: input.campaignKey ?? null,
      author: input.author,
    },
  });
}

export async function listMasterContent(limit = 50) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new SocialContentPolicyError(400, 'limit must be an integer between 1 and 100');
  }
  return prisma.masterContent.findMany({
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit,
    include: { variants: { orderBy: { platform: 'asc' } } },
  });
}

export async function createSocialVariant(input: {
  masterContentId: string;
  platform: string;
  body: string;
  mediaManifest?: unknown;
  author: string;
  idempotencyKey: string;
}) {
  validateKey(input.masterContentId, 'master content id');
  validateKey(input.author, 'author');
  validateKey(input.idempotencyKey, 'idempotency key');
  const master = await prisma.masterContent.findUnique({ where: { id: input.masterContentId } });
  if (!master) throw new SocialContentPolicyError(404, 'Master content not found');
  const validated = validateSocialVariant(input);
  try {
    return await prisma.socialContentVariant.create({
      data: {
        masterContentId: input.masterContentId,
        platform: validated.platform,
        body: validated.body,
        mediaManifest: validated.mediaManifest as Prisma.InputJsonValue,
        contentHash: validated.contentHash,
        policyVersion: validated.policyVersion,
        validationReceipt: validated.validationReceipt as Prisma.InputJsonValue,
        author: input.author,
        idempotencyKey: input.idempotencyKey,
      },
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
    const existing = await prisma.socialContentVariant.findFirst({
      where: { masterContentId: input.masterContentId, platform: validated.platform },
    });
    if (!existing) throw error;
    if (existing.contentHash !== validated.contentHash || existing.idempotencyKey !== input.idempotencyKey) {
      throw new SocialContentPolicyError(409, 'Variant idempotency or platform content conflicts with an existing variant');
    }
    return existing;
  }
}

export async function submitMasterForReview(id: string) {
  const result = await prisma.masterContent.updateMany({ where: { id, status: 'DRAFT' }, data: { status: 'IN_REVIEW' } });
  if (result.count !== 1) throw new SocialContentPolicyError(409, 'Only DRAFT master content can enter review');
  return prisma.masterContent.findUniqueOrThrow({ where: { id } });
}

export async function approveMasterContent(id: string, reviewedBy: string) {
  const master = await prisma.masterContent.findUnique({ where: { id } });
  if (!master) throw new SocialContentPolicyError(404, 'Master content not found');
  assertIndependentReviewer(master.author, reviewedBy);
  const result = await prisma.masterContent.updateMany({
    where: { id, status: 'IN_REVIEW' },
    data: { status: 'APPROVED', approvedBy: reviewedBy, approvedAt: new Date() },
  });
  if (result.count !== 1) throw new SocialContentPolicyError(409, 'Only IN_REVIEW master content can be approved');
  return prisma.masterContent.findUniqueOrThrow({ where: { id } });
}

export async function submitVariantForReview(id: string) {
  const result = await prisma.socialContentVariant.updateMany({ where: { id, status: 'DRAFT' }, data: { status: 'IN_REVIEW' } });
  if (result.count !== 1) throw new SocialContentPolicyError(409, 'Only DRAFT variants can enter review');
  return prisma.socialContentVariant.findUniqueOrThrow({ where: { id } });
}

export async function approveSocialVariant(id: string, reviewedBy: string) {
  const variant = await prisma.socialContentVariant.findUnique({ where: { id } });
  if (!variant) throw new SocialContentPolicyError(404, 'Social variant not found');
  assertIndependentReviewer(variant.author, reviewedBy);
  const result = await prisma.socialContentVariant.updateMany({
    where: { id, status: 'IN_REVIEW' },
    data: { status: 'APPROVED', approvedBy: reviewedBy, approvedAt: new Date() },
  });
  if (result.count !== 1) throw new SocialContentPolicyError(409, 'Only IN_REVIEW variants can be approved');
  return prisma.socialContentVariant.findUniqueOrThrow({ where: { id } });
}

/** Schedule only an internal job. No adapter lookup or provider call occurs. */
export async function scheduleSocialVariant(id: string, scheduledAt: Date) {
  if (Number.isNaN(scheduledAt.getTime())) throw new SocialContentPolicyError(400, 'Invalid scheduledAt');
  const variant = await prisma.socialContentVariant.findUnique({ where: { id } });
  if (!variant) throw new SocialContentPolicyError(404, 'Social variant not found');
  if (variant.status !== 'APPROVED') {
    throw new SocialContentPolicyError(409, 'Only APPROVED variants can be scheduled');
  }
  const idempotencyKey = `social-publish:${variant.id}:${variant.contentHash.slice(0, 32)}`;
  const job = await enqueueJob({
    type: 'SOCIAL_PUBLISH',
    payload: {
      variantId: variant.id,
      platform: variant.platform,
      contentHash: variant.contentHash,
      policyVersion: variant.policyVersion,
    },
    idempotencyKey,
    runAt: scheduledAt,
  });
  const result = await prisma.socialContentVariant.updateMany({
    where: { id, status: 'APPROVED' },
    data: { status: 'SCHEDULED', scheduledAt },
  });
  if (result.count !== 1) throw new SocialContentPolicyError(409, 'Variant changed before it could be scheduled');
  return { variant: await prisma.socialContentVariant.findUniqueOrThrow({ where: { id } }), job };
}

function normalizeUtmValue(value: string, label: string) {
  if (typeof value !== 'string') throw new SocialContentPolicyError(400, `${label} is required`);
  const normalized = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/.test(normalized)) {
    throw new SocialContentPolicyError(400, `Invalid ${label}`);
  }
  return normalized;
}

function normalizeDestinationUrl(value: string) {
  if (typeof value !== 'string' || value.length > 2_000 || CREDENTIAL_PATTERN.test(value)) {
    throw new SocialContentPolicyError(400, 'Invalid destinationUrl');
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new SocialContentPolicyError(400, 'destinationUrl must be a valid URL');
  }
  if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) {
    throw new SocialContentPolicyError(400, 'destinationUrl must use HTTPS without embedded credentials');
  }
  for (const key of parsed.searchParams.keys()) {
    if (/password|secret|token|authorization|cookie|api.?key/i.test(key)) {
      throw new SocialContentPolicyError(400, 'destinationUrl contains a prohibited query parameter');
    }
  }
  parsed.hash = '';
  return parsed.toString();
}

export async function recordSocialAttribution(input: {
  variantId: string;
  destinationUrl: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmContent?: string;
}) {
  validateKey(input.variantId, 'social variant id');
  const variant = await prisma.socialContentVariant.findUnique({ where: { id: input.variantId }, select: { id: true } });
  if (!variant) throw new SocialContentPolicyError(404, 'Social variant not found');
  const normalized = {
    variantId: input.variantId,
    destinationUrl: normalizeDestinationUrl(input.destinationUrl),
    utmSource: normalizeUtmValue(input.utmSource, 'utmSource'),
    utmMedium: normalizeUtmValue(input.utmMedium, 'utmMedium'),
    utmCampaign: normalizeUtmValue(input.utmCampaign, 'utmCampaign'),
    utmContent: input.utmContent === undefined ? null : normalizeUtmValue(input.utmContent, 'utmContent'),
  };
  const receiptHash = sha256(JSON.stringify(normalized));
  try {
    const receipt = await prisma.socialAttributionReceipt.create({ data: { ...normalized, receiptHash } });
    return { receipt, reused: false };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
    const existing = await prisma.socialAttributionReceipt.findUnique({ where: { variantId: input.variantId } });
    if (!existing) throw error;
    if (existing.receiptHash !== receiptHash) {
      throw new SocialContentPolicyError(409, 'Attribution receipt already exists with a different payload');
    }
    return { receipt: existing, reused: true };
  }
}

function mapDeliveryState(status: string | undefined) {
  switch (status) {
    case 'QUEUED':
      return 'QUEUED_PROVIDER_UNVERIFIED';
    case 'RUNNING':
      return 'PUBLISHING_PROVIDER_UNVERIFIED';
    case 'RETRYABLE_FAILED':
      return 'RETRYING_PROVIDER_UNVERIFIED';
    case 'SUCCEEDED':
      return 'INTERNAL_JOB_SUCCEEDED_PROVIDER_UNVERIFIED';
    case 'DEAD_LETTER':
      return 'DEAD_LETTER_PROVIDER_UNVERIFIED';
    default:
      return 'NOT_SCHEDULED';
  }
}

/** Project internal job state without claiming a provider-side delivery. */
export async function getSocialDeliveryStatus(variantId: string) {
  validateKey(variantId, 'social variant id');
  const variant = await prisma.socialContentVariant.findUnique({
    where: { id: variantId },
    select: { id: true, platform: true, status: true, scheduledAt: true, publishedAt: true, providerPostId: true },
  });
  if (!variant) throw new SocialContentPolicyError(404, 'Social variant not found');
  const job = await prisma.job.findFirst({
    where: { type: 'SOCIAL_PUBLISH', idempotencyKey: { startsWith: `social-publish:${variantId}:` } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { id: true, type: true, status: true, attempts: true, maxAttempts: true, runAt: true, lastError: true, completedAt: true },
  });
  return {
    variant: {
      id: variant.id,
      platform: variant.platform,
      status: variant.status,
      scheduledAt: variant.scheduledAt,
      publishedAt: variant.publishedAt,
      providerPostId: variant.providerPostId,
    },
    job,
    deliveryState: mapDeliveryState(job?.status),
    providerVerified: false,
  };
}

export function registerSocialAdapter(adapter: SocialProviderAdapter) {
  assertPlatform(adapter.platform);
  if (adapters.has(adapter.platform)) throw new SocialContentPolicyError(409, `Adapter already registered for ${adapter.platform}`);
  adapters.set(adapter.platform, adapter);
  return () => {
    if (adapters.get(adapter.platform) === adapter) adapters.delete(adapter.platform);
  };
}

export function getSocialAdapter(platform: string) {
  assertPlatform(platform);
  const adapter = adapters.get(platform);
  if (!adapter) throw new SocialContentPolicyError(503, `No adapter is registered for ${platform}`);
  return adapter;
}
