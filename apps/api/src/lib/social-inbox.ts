import { Prisma, type SocialPlatform } from '@prisma/client';
import { prisma } from './prisma';
import { SocialContentPolicyError } from './social-content';

const PLATFORMS = new Set<SocialPlatform>(['LINKEDIN', 'INSTAGRAM', 'FACEBOOK', 'X', 'THREADS', 'TIKTOK', 'YOUTUBE', 'GOOGLE_BUSINESS', 'PINTEREST']);
const INTENTS = new Set(['UNCLASSIFIED', 'LEAD', 'CUSTOMER', 'QUESTION', 'COMPLAINT', 'SPAM', 'OTHER']);
const STATUSES = new Set(['RECEIVED', 'CLASSIFIED', 'ASSIGNED', 'REQUIRES_APPROVAL', 'RESPONDED', 'IGNORED']);
const SAFE_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/_-]{0,127}$/;
const CREDENTIAL_PATTERN = /(?:sk|re)_[A-Za-z0-9_-]{12,}|bearer\s+[A-Za-z0-9._-]{12,}/i;

export type SocialInboxIntent = 'UNCLASSIFIED' | 'LEAD' | 'CUSTOMER' | 'QUESTION' | 'COMPLAINT' | 'SPAM' | 'OTHER';
export type SocialInboxMessageStatus = 'RECEIVED' | 'CLASSIFIED' | 'ASSIGNED' | 'REQUIRES_APPROVAL' | 'RESPONDED' | 'IGNORED';

function validateSafeKey(value: string, label: string, max = 128) {
  if (typeof value !== 'string' || value.length < 1 || value.length > max || !SAFE_KEY_PATTERN.test(value) || CREDENTIAL_PATTERN.test(value)) {
    throw new SocialContentPolicyError(400, `Invalid ${label}`);
  }
  return value;
}

function assertPlatform(platform: string): asserts platform is SocialPlatform {
  if (!PLATFORMS.has(platform as SocialPlatform)) throw new SocialContentPolicyError(400, 'Unsupported social platform');
}

function assertReceivedAt(receivedAt: Date) {
  if (!(receivedAt instanceof Date) || Number.isNaN(receivedAt.getTime())) {
    throw new SocialContentPolicyError(400, 'Invalid receivedAt');
  }
}

export async function recordSocialInboxReceipt(input: {
  platform: string;
  accountKey: string;
  externalMessageKey: string;
  threadKey: string;
  senderHandle: string;
  messageType: string;
  receivedAt: Date;
  contentHash: string;
}) {
  assertPlatform(input.platform);
  validateSafeKey(input.accountKey, 'account key');
  validateSafeKey(input.externalMessageKey, 'external message key');
  validateSafeKey(input.threadKey, 'thread key');
  validateSafeKey(input.senderHandle, 'sender handle', 200);
  validateSafeKey(input.messageType, 'message type', 64);
  assertReceivedAt(input.receivedAt);
  if (!/^[0-9a-f]{64}$/i.test(input.contentHash)) throw new SocialContentPolicyError(400, 'contentHash must be a SHA-256 hex digest');

  try {
    const receipt = await prisma.socialInboxMessage.create({
      data: {
        platform: input.platform,
        accountKey: input.accountKey,
        externalMessageKey: input.externalMessageKey,
        threadKey: input.threadKey,
        senderHandle: input.senderHandle,
        messageType: input.messageType,
        receivedAt: input.receivedAt,
        contentHash: input.contentHash.toLowerCase(),
      },
    });
    return { receipt, reused: false };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
    const existing = await prisma.socialInboxMessage.findFirst({
      where: { platform: input.platform, accountKey: input.accountKey, externalMessageKey: input.externalMessageKey },
    });
    if (!existing) throw error;
    const samePayload =
      existing.contentHash === input.contentHash.toLowerCase() &&
      existing.threadKey === input.threadKey &&
      existing.senderHandle === input.senderHandle &&
      existing.messageType === input.messageType &&
      existing.receivedAt.getTime() === input.receivedAt.getTime();
    if (!samePayload) throw new SocialContentPolicyError(409, 'Inbound message key already identifies a different receipt');
    return { receipt: existing, reused: true };
  }
}

export async function listSocialInbox(input: { limit?: number; status?: SocialInboxMessageStatus; intent?: SocialInboxIntent } = {}) {
  const limit = input.limit ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new SocialContentPolicyError(400, 'limit must be an integer between 1 and 100');
  if (input.status && !STATUSES.has(input.status)) throw new SocialContentPolicyError(400, 'Unsupported inbox status');
  if (input.intent && !INTENTS.has(input.intent)) throw new SocialContentPolicyError(400, 'Unsupported inbox intent');
  return prisma.socialInboxMessage.findMany({
    where: { status: input.status, intent: input.intent },
    orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
    take: limit,
    select: {
      id: true,
      platform: true,
      accountKey: true,
      externalMessageKey: true,
      threadKey: true,
      senderHandle: true,
      messageType: true,
      receivedAt: true,
      contentHash: true,
      intent: true,
      status: true,
      assignedTo: true,
      classificationReceipt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function classifySocialInboxMessage(id: string, intent: SocialInboxIntent, reviewedBy: string) {
  validateSafeKey(id, 'inbox message id');
  validateSafeKey(reviewedBy, 'reviewer');
  if (!INTENTS.has(intent) || intent === 'UNCLASSIFIED') throw new SocialContentPolicyError(400, 'A concrete inbox intent is required');
  const existing = await prisma.socialInboxMessage.findUnique({ where: { id } });
  if (!existing) throw new SocialContentPolicyError(404, 'Social inbox message not found');
  if (!['RECEIVED', 'CLASSIFIED'].includes(existing.status)) {
    throw new SocialContentPolicyError(409, `Cannot classify inbox message in ${existing.status} state`);
  }
  return prisma.socialInboxMessage.update({
    where: { id },
    data: {
      intent,
      status: 'CLASSIFIED',
      classificationReceipt: { method: 'HUMAN', reviewedBy, classifiedAt: new Date().toISOString() },
    },
  });
}
