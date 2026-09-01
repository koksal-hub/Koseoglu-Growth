import crypto from 'node:crypto';
import { Prisma, type VisibilityAssetStatus, type VisibilityMode, type VisibilityRobotsDirective } from '@prisma/client';
import { prisma } from './prisma';
import { assertIndependentReviewer } from './social-content';

export const VISIBILITY_POLICY_VERSION = 'visibility-policy-v1';

// These are product guardrails for review quality, not claims about a search
// engine's current ranking or snippet limits.
export const VISIBILITY_LIMITS = Object.freeze({
  titleCharacters: 70,
  descriptionCharacters: 320,
  maxTargetIntents: 10,
  targetIntentCharacters: 120,
  maxStructuredDataCharacters: 10_000,
} as const);

const SAFE_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/;
const CREDENTIAL_PATTERN = /(?:sk|re)_[A-Za-z0-9_-]{12,}|bearer\s+[A-Za-z0-9._-]{12,}/i;
const PROHIBITED_QUERY_PARAMETER = /password|secret|token|authorization|cookie|api.?key|access.?code|client.?secret/i;

export class VisibilityPolicyError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message);
    this.name = 'VisibilityPolicyError';
  }
}

function validateKey(value: string, label: string) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 128 || !SAFE_KEY_PATTERN.test(value)) {
    throw new VisibilityPolicyError(400, `Invalid ${label}`);
  }
}

function canonicalize(value: unknown, path: string): Prisma.JsonValue {
  if (value === null) return null;
  if (typeof value === 'string') {
    if (CREDENTIAL_PATTERN.test(value)) throw new VisibilityPolicyError(400, `${path} contains credential-shaped data`);
    return value;
  }
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new VisibilityPolicyError(400, `${path} must be finite JSON`);
    return value;
  }
  if (Array.isArray(value)) return value.map((item, index) => canonicalize(item, `${path}[${index}]`));
  if (typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new VisibilityPolicyError(400, `${path} must contain JSON values only`);
  }
  const sorted: Record<string, Prisma.JsonValue> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    if (/password|secret|token|authorization|cookie|api.?key/i.test(key)) {
      throw new VisibilityPolicyError(400, `${path}.${key} is not allowed`);
    }
    sorted[key] = canonicalize((value as Record<string, unknown>)[key], `${path}.${key}`);
  }
  return sorted;
}

function sha256(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function validateLocale(locale: string) {
  const normalized = locale.trim();
  if (!/^[a-z]{2}(?:-[A-Z]{2})?$/.test(normalized)) {
    throw new VisibilityPolicyError(400, 'locale must use a supported language or language-region form');
  }
  return normalized;
}

function validateCanonicalUrl(value: string) {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new VisibilityPolicyError(400, 'canonicalUrl must be a valid URL');
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new VisibilityPolicyError(400, 'canonicalUrl must use HTTPS without embedded credentials');
  }
  if (parsed.hash) throw new VisibilityPolicyError(400, 'canonicalUrl must not contain a fragment');
  if (parsed.search) {
    for (const key of parsed.searchParams.keys()) {
      if (PROHIBITED_QUERY_PARAMETER.test(key)) {
        throw new VisibilityPolicyError(400, 'canonicalUrl contains a prohibited query parameter');
      }
    }
    throw new VisibilityPolicyError(400, 'canonicalUrl must not contain query parameters');
  }
  return parsed.toString();
}

function validateTargetIntents(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > VISIBILITY_LIMITS.maxTargetIntents) {
    throw new VisibilityPolicyError(400, `targetIntents must contain 1-${VISIBILITY_LIMITS.maxTargetIntents} values`);
  }
  const normalized = value.map((intent, index) => {
    if (typeof intent !== 'string') throw new VisibilityPolicyError(400, `targetIntents[${index}] must be a string`);
    const trimmed = intent.trim();
    if (trimmed.length < 1 || trimmed.length > VISIBILITY_LIMITS.targetIntentCharacters) {
      throw new VisibilityPolicyError(400, `targetIntents[${index}] has an invalid length`);
    }
    if (CREDENTIAL_PATTERN.test(trimmed)) throw new VisibilityPolicyError(400, `targetIntents[${index}] contains credential-shaped data`);
    return trimmed;
  });
  const unique = [...new Set(normalized.map((intent) => intent.toLocaleLowerCase('en-US')))].sort();
  if (unique.length !== normalized.length) throw new VisibilityPolicyError(400, 'targetIntents must be unique');
  return normalized;
}

export function validateVisibilityAsset(input: {
  assetKey: string;
  mode: string;
  locale: string;
  canonicalUrl: string;
  title: string;
  description: string;
  targetIntents: unknown;
  structuredData?: unknown;
  robots?: string;
}) {
  validateKey(input.assetKey, 'asset key');
  if (input.mode !== 'SEO' && input.mode !== 'GEO') throw new VisibilityPolicyError(400, 'Unsupported visibility mode');
  const locale = validateLocale(input.locale);
  const canonicalUrl = validateCanonicalUrl(input.canonicalUrl);
  const title = input.title.trim();
  if (title.length < 1 || title.length > VISIBILITY_LIMITS.titleCharacters) {
    throw new VisibilityPolicyError(400, 'title exceeds the product policy character limit');
  }
  const description = input.description.trim();
  if (description.length < 1 || description.length > VISIBILITY_LIMITS.descriptionCharacters) {
    throw new VisibilityPolicyError(400, 'description exceeds the product policy character limit');
  }
  const targetIntents = validateTargetIntents(input.targetIntents);
  const structuredData = input.structuredData === undefined ? null : canonicalize(input.structuredData, 'structuredData');
  const serializedStructuredData = structuredData === null ? '' : JSON.stringify(structuredData);
  if (serializedStructuredData.length > VISIBILITY_LIMITS.maxStructuredDataCharacters) {
    throw new VisibilityPolicyError(400, 'structuredData is too large');
  }
  const robots = input.robots === undefined ? 'INDEX_FOLLOW' : input.robots;
  if (robots !== 'INDEX_FOLLOW' && robots !== 'NOINDEX_NOFOLLOW') {
    throw new VisibilityPolicyError(400, 'Unsupported robots directive');
  }
  const contentHash = sha256(
    JSON.stringify({ mode: input.mode, locale, canonicalUrl, title, description, targetIntents, structuredData, robots })
  );
  return {
    assetKey: input.assetKey,
    mode: input.mode as VisibilityMode,
    locale,
    canonicalUrl,
    title,
    description,
    targetIntents,
    structuredData,
    robots: robots as VisibilityRobotsDirective,
    contentHash,
    policyVersion: VISIBILITY_POLICY_VERSION,
    validationReceipt: {
      policyVersion: VISIBILITY_POLICY_VERSION,
      mode: input.mode,
      locale,
      titleLength: title.length,
      descriptionLength: description.length,
      targetIntentCount: targetIntents.length,
      structuredDataPresent: structuredData !== null,
      providerEvidence: 'NOT_RUN',
      indexingEvidence: 'NOT_RUN',
    },
  };
}

export async function createVisibilityAsset(input: {
  assetKey: string;
  mode: string;
  locale: string;
  canonicalUrl: string;
  title: string;
  description: string;
  targetIntents: unknown;
  structuredData?: unknown;
  robots?: string;
  author: string;
}) {
  validateKey(input.author, 'author');
  const validated = validateVisibilityAsset(input);
  try {
    const asset = await prisma.searchVisibilityAsset.create({
      data: {
        ...validated,
        author: input.author,
        targetIntents: validated.targetIntents as Prisma.InputJsonValue,
        structuredData: validated.structuredData as Prisma.InputJsonValue,
        validationReceipt: validated.validationReceipt as Prisma.InputJsonValue,
      },
    });
    return { asset, reused: false };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
    const existing = await prisma.searchVisibilityAsset.findUnique({ where: { assetKey: input.assetKey } });
    if (existing) {
      if (existing.contentHash !== validated.contentHash) {
        throw new VisibilityPolicyError(409, 'assetKey already exists with a different payload');
      }
      return { asset: existing, reused: true };
    }
    throw new VisibilityPolicyError(409, 'An asset already exists for this mode, locale and canonicalUrl');
  }
}

export async function listVisibilityAssets(input: {
  limit?: number;
  mode?: VisibilityMode;
  status?: VisibilityAssetStatus;
} = {}) {
  const limit = input.limit ?? 100;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new VisibilityPolicyError(400, 'limit must be an integer between 1 and 100');
  }
  return prisma.searchVisibilityAsset.findMany({
    where: { mode: input.mode, status: input.status },
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    take: limit,
  });
}

export async function submitVisibilityAssetForReview(id: string) {
  validateKey(id, 'visibility asset id');
  const result = await prisma.searchVisibilityAsset.updateMany({ where: { id, status: 'DRAFT' }, data: { status: 'IN_REVIEW' } });
  if (result.count === 1) return prisma.searchVisibilityAsset.findUniqueOrThrow({ where: { id } });
  const existing = await prisma.searchVisibilityAsset.findUnique({ where: { id } });
  if (!existing) throw new VisibilityPolicyError(404, 'Visibility asset not found');
  throw new VisibilityPolicyError(409, 'Only DRAFT visibility assets can enter review');
}

export async function approveVisibilityAsset(id: string, reviewedBy: string) {
  validateKey(id, 'visibility asset id');
  validateKey(reviewedBy, 'reviewer');
  const existing = await prisma.searchVisibilityAsset.findUnique({ where: { id } });
  if (!existing) throw new VisibilityPolicyError(404, 'Visibility asset not found');
  assertIndependentReviewer(existing.author, reviewedBy);
  const result = await prisma.searchVisibilityAsset.updateMany({
    where: { id, status: 'IN_REVIEW' },
    data: { status: 'APPROVED', approvedBy: reviewedBy, approvedAt: new Date() },
  });
  if (result.count !== 1) throw new VisibilityPolicyError(409, 'Only IN_REVIEW visibility assets can be approved');
  return prisma.searchVisibilityAsset.findUniqueOrThrow({ where: { id } });
}

export async function evaluateVisibilityReadiness(id: string) {
  validateKey(id, 'visibility asset id');
  const asset = await prisma.searchVisibilityAsset.findUnique({ where: { id } });
  if (!asset) throw new VisibilityPolicyError(404, 'Visibility asset not found');
  const blockers: string[] = [];
  if (asset.status !== 'APPROVED') blockers.push('ASSET_NOT_APPROVED');
  if (asset.robots === 'NOINDEX_NOFOLLOW') blockers.push('ROBOTS_BLOCK_INDEXING');
  blockers.push('SEARCH_PROVIDER_EXECUTION_DISABLED', 'PROVIDER_EVIDENCE_NOT_RUN');
  return {
    ready: false,
    assetId: asset.id,
    mode: asset.mode,
    canonicalUrl: asset.canonicalUrl,
    providerEvidence: 'NOT_RUN',
    indexingEvidence: 'NOT_RUN',
    blockers,
  };
}
