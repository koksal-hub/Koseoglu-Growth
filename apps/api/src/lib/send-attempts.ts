import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { Env } from '../plugins/env';
import {
  buildRecipientHash,
  evaluateCommunicationGate,
  normalizeContactPointValue,
} from './contact-points';
import {
  createResendTestProvider,
  ProviderDispatchError,
  ResendTestProviderConfig,
  resolveSandboxRecipient,
  SandboxDeliveryScenario,
  sha256,
  TestEmailProvider,
} from './email-provider';
import { prisma } from './prisma';

export const MAX_SANDBOX_ATTEMPT_AGE_HOURS = 23;
export const MAX_IDEMPOTENCY_KEY_LENGTH = 128;
export const STALE_DISPATCH_LEASE_MINUTES = 5;

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const SAFE_ACTOR_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/;

type Transaction = Prisma.TransactionClient;

export type PrepareSandboxSendAttemptInput = {
  draftId: string;
  scenario: SandboxDeliveryScenario;
  idempotencyKey: string;
  requestedBy: string;
  evaluatedAt?: Date;
};

type DispatchSandboxSendAttemptInput = {
  sendAttemptId: string;
  provider: TestEmailProvider;
  evaluatedAt?: Date;
};

export class EmailSandboxPolicyError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message);
    this.name = 'EmailSandboxPolicyError';
  }
}

const sendAttemptView = {
  draft: {
    select: {
      id: true,
      status: true,
      currentRevisionNumber: true,
      expiresAt: true,
      policyVersion: true,
    },
  },
  approval: {
    select: {
      id: true,
      decision: true,
      revisionId: true,
      contentHash: true,
      permissionId: true,
      decidedAt: true,
    },
  },
  revision: {
    select: { id: true, revisionNumber: true, contentHash: true },
  },
  contactPoint: {
    select: { id: true, type: true, classification: true, countryCode: true },
  },
  permission: {
    select: { id: true, status: true, policyVersion: true, checkedAt: true, expiresAt: true },
  },
  deliveryEvents: { orderBy: { occurredAt: 'asc' as const } },
  replies: { orderBy: { receivedAt: 'asc' as const } },
} as const;

export async function getSendAttempt(id: string) {
  const attempt = await prisma.sendAttempt.findUnique({ where: { id }, include: sendAttemptView });
  if (!attempt) throw new EmailSandboxPolicyError(404, 'Send attempt not found');
  return attempt;
}

export type EmailSandboxDispatchService = {
  dispatch(input: {
    sendAttemptId: string;
    evaluatedAt?: Date;
  }): Promise<Awaited<ReturnType<typeof getSendAttempt>>>;
};

/**
 * The only production dispatch entry point. A caller cannot supply an enabled
 * boolean or arbitrary provider; the capability exists only after validated
 * environment gates, credentials, sender and webhook secret are all present.
 */
export function createEmailSandboxDispatchService(
  env: Env,
  options: Pick<ResendTestProviderConfig, 'fetchImpl' | 'timeoutMs'> = {}
): EmailSandboxDispatchService {
  if (
    !env.OUTREACH_TEST_DISPATCH_ENABLED ||
    env.EMAIL_PROVIDER_MODE !== 'RESEND_TEST' ||
    !env.RESEND_API_KEY ||
    !env.RESEND_WEBHOOK_SECRET ||
    !env.EMAIL_FROM_ADDRESS
  ) {
    throw new EmailSandboxPolicyError(403, 'Sandbox provider execution is disabled');
  }
  const provider = createResendTestProvider({
    apiKey: env.RESEND_API_KEY,
    fromAddress: env.EMAIL_FROM_ADDRESS,
    ...options,
  });
  return Object.freeze({
    dispatch: (input) => dispatchSandboxSendAttempt({ ...input, provider }),
  });
}

function validatePrepareInput(input: PrepareSandboxSendAttemptInput) {
  if (
    input.idempotencyKey.length < 1 ||
    input.idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH ||
    !IDEMPOTENCY_KEY_PATTERN.test(input.idempotencyKey)
  ) {
    throw new EmailSandboxPolicyError(400, 'Invalid idempotency key');
  }
  if (
    input.requestedBy.length < 1 ||
    input.requestedBy.length > 128 ||
    !SAFE_ACTOR_PATTERN.test(input.requestedBy)
  ) {
    throw new EmailSandboxPolicyError(400, 'Invalid requestedBy actor');
  }
}

function asJsonObject(value: Prisma.JsonValue, label: string): Record<string, Prisma.JsonValue> {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new EmailSandboxPolicyError(409, `${label} receipt is malformed`);
  }
  return value as Record<string, Prisma.JsonValue>;
}

function buildPayloadHash(input: {
  draftId: string;
  approvalId: string;
  revisionId: string;
  contentHash: string;
  scenario: SandboxDeliveryScenario;
  approvedRecipientHash: string;
  recipientHash: string;
  requestedBy: string;
}) {
  return sha256(
    JSON.stringify({
      provider: 'RESEND',
      recipientMode: 'TEST_SIMULATION',
      ...input,
    })
  );
}

async function lockContactPoint(tx: Transaction, contactPointId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT "id" FROM "ContactPoint" WHERE "id" = ${contactPointId} FOR UPDATE`
  );
  if (rows.length !== 1) throw new EmailSandboxPolicyError(404, 'Contact point not found');
}

async function lockSendAttempt(tx: Transaction, sendAttemptId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT "id" FROM "SendAttempt" WHERE "id" = ${sendAttemptId} FOR UPDATE`
  );
  if (rows.length !== 1) throw new EmailSandboxPolicyError(404, 'Send attempt not found');
}

async function evaluateExactGate(
  tx: Transaction,
  input: {
    contactPointId: string;
    purpose: 'SALES_OUTREACH' | 'MARKETING' | 'CUSTOMER_SERVICE';
    jurisdictionCountry: string;
    policyVersion: string;
    expectedPermissionId: string;
    evaluatedAt: Date;
    stage: 'PREPARE' | 'DISPATCH';
  }
) {
  const gate = await evaluateCommunicationGate(
    {
      contactPointId: input.contactPointId,
      channel: 'EMAIL',
      purpose: input.purpose,
      jurisdictionCountry: input.jurisdictionCountry,
      evaluatedAt: input.evaluatedAt,
    },
    tx
  );
  const permission = gate.permissionId
    ? await tx.communicationPermission.findUnique({ where: { id: gate.permissionId } })
    : null;
  const reasons = [...gate.reasons];
  if (permission?.policyVersion !== input.policyVersion)
    reasons.push('PERMISSION_POLICY_VERSION_CHANGED');
  if (permission?.id !== input.expectedPermissionId)
    reasons.push('APPROVED_PERMISSION_IS_NO_LONGER_CURRENT');
  const allowed = gate.allowed && reasons.length === 0;
  const receipt = {
    stage: input.stage,
    decision: allowed ? ('ALLOW' as const) : ('DENY' as const),
    reasons: Array.from(new Set(reasons)),
    contactPointId: input.contactPointId,
    channel: 'EMAIL' as const,
    purpose: input.purpose,
    jurisdictionCountry: input.jurisdictionCountry,
    permissionId: permission?.id ?? null,
    permissionPolicyVersion: permission?.policyVersion ?? null,
    evaluatedAt: input.evaluatedAt.toISOString(),
    rawRecipientStored: false,
    customerMessageSubmitted: false,
  };
  if (!allowed || !permission) {
    throw new EmailSandboxPolicyError(
      409,
      `Communication gate denied: ${receipt.reasons.join(', ') || 'POLICY_MISMATCH'}`
    );
  }
  return { permission, receipt };
}

async function loadApprovedDraft(tx: Transaction, draftId: string, evaluatedAt: Date) {
  const draft = await tx.outreachDraft.findUnique({
    where: { id: draftId },
  });
  if (!draft) throw new EmailSandboxPolicyError(404, 'Outreach draft not found');
  const approval = await tx.outreachApproval.findUnique({ where: { draftId } });
  const contactPoint = await tx.contactPoint.findUnique({ where: { id: draft.contactPointId } });
  const revisions = await tx.outreachDraftRevision.findMany({
    where: { draftId },
    orderBy: { revisionNumber: 'asc' },
  });
  if (!contactPoint) throw new EmailSandboxPolicyError(404, 'Contact point not found');
  if (draft.status !== 'APPROVED' || approval?.decision !== 'APPROVED') {
    throw new EmailSandboxPolicyError(
      409,
      'Only independently approved drafts can prepare a send attempt'
    );
  }
  if (draft.expiresAt <= evaluatedAt) {
    throw new EmailSandboxPolicyError(409, 'Approved draft is expired');
  }
  const revision = revisions.find(
    (candidate) => candidate.revisionNumber === draft.currentRevisionNumber
  );
  if (!revision) throw new EmailSandboxPolicyError(409, 'Approved revision is missing');
  if (
    approval.revisionId !== revision.id ||
    approval.contentHash !== revision.contentHash ||
    approval.policyVersion !== draft.policyVersion
  ) {
    throw new EmailSandboxPolicyError(
      409,
      'Approval is not bound to the current draft revision and policy'
    );
  }
  if (!approval.permissionId) {
    throw new EmailSandboxPolicyError(409, 'Approved draft is missing its permission receipt');
  }
  const recipientSnapshot = asJsonObject(draft.recipientSnapshot, 'Recipient');
  const approvedRecipientHash = buildRecipientHash('EMAIL', contactPoint.normalizedValue);
  if (
    recipientSnapshot.contactPointId !== draft.contactPointId ||
    recipientSnapshot.recipientHash !== approvedRecipientHash ||
    recipientSnapshot.rawRecipientStored !== false
  ) {
    throw new EmailSandboxPolicyError(
      409,
      'Approved recipient snapshot no longer matches the contact point'
    );
  }
  return { draft, revision, approval, approvedRecipientHash };
}

function samePrepareRequest(
  existing: { draftId: string; scenario: SandboxDeliveryScenario; requestedBy: string },
  input: PrepareSandboxSendAttemptInput
) {
  return (
    existing.draftId === input.draftId &&
    existing.scenario === input.scenario &&
    existing.requestedBy === input.requestedBy
  );
}

export async function prepareSandboxSendAttempt(input: PrepareSandboxSendAttemptInput) {
  validatePrepareInput(input);
  const existing = await prisma.sendAttempt.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });
  if (existing) {
    if (!samePrepareRequest(existing, input)) {
      throw new EmailSandboxPolicyError(
        409,
        'Idempotency key was already used with a different request'
      );
    }
    return getSendAttempt(existing.id);
  }

  try {
    const sendAttemptId = await prisma.$transaction(
      async (tx) => {
        const evaluatedAt = input.evaluatedAt ?? new Date();
        const context = await loadApprovedDraft(tx, input.draftId, evaluatedAt);
        await lockContactPoint(tx, context.draft.contactPointId);
        const gate = await evaluateExactGate(tx, {
          contactPointId: context.draft.contactPointId,
          purpose: context.draft.purpose,
          jurisdictionCountry: context.draft.jurisdictionCountry,
          policyVersion: context.draft.policyVersion,
          expectedPermissionId: context.approval.permissionId!,
          evaluatedAt,
          stage: 'PREPARE',
        });
        const sandboxRecipient = resolveSandboxRecipient(input.scenario);
        const recipientHash = buildRecipientHash('EMAIL', sandboxRecipient);
        if (recipientHash === context.approvedRecipientHash) {
          throw new EmailSandboxPolicyError(
            409,
            'Sandbox recipient must differ from the approved customer recipient'
          );
        }
        const maximumExpiry = new Date(
          evaluatedAt.getTime() + MAX_SANDBOX_ATTEMPT_AGE_HOURS * 60 * 60 * 1_000
        );
        const expiresAt = new Date(
          Math.min(
            context.draft.expiresAt.getTime(),
            gate.permission.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY,
            maximumExpiry.getTime()
          )
        );
        if (expiresAt <= evaluatedAt) {
          throw new EmailSandboxPolicyError(
            409,
            'Permission expires before a sandbox attempt can be prepared'
          );
        }
        const payloadHash = buildPayloadHash({
          draftId: context.draft.id,
          approvalId: context.approval.id,
          revisionId: context.revision.id,
          contentHash: context.revision.contentHash,
          scenario: input.scenario,
          approvedRecipientHash: context.approvedRecipientHash,
          recipientHash,
          requestedBy: input.requestedBy,
        });
        const attempt = await tx.sendAttempt.create({
          data: {
            draftId: context.draft.id,
            approvalId: context.approval.id,
            revisionId: context.revision.id,
            contactPointId: context.draft.contactPointId,
            permissionId: gate.permission.id,
            scenario: input.scenario,
            idempotencyKey: input.idempotencyKey,
            payloadHash,
            contentHash: context.revision.contentHash,
            approvedRecipientHash: context.approvedRecipientHash,
            recipientHash,
            gateReceipt: gate.receipt,
            requestedBy: input.requestedBy,
            preparedAt: evaluatedAt,
            expiresAt,
          },
        });
        await tx.event.create({
          data: {
            type: 'SEND_ATTEMPT_PREPARED',
            entityType: 'SendAttempt',
            entityId: attempt.id,
            actor: input.requestedBy,
            occurredAt: evaluatedAt,
            metadata: {
              provider: 'RESEND',
              recipientMode: 'TEST_SIMULATION',
              scenario: input.scenario,
              payloadHash,
              rawRecipientStored: false,
              providerCallPerformed: false,
              customerMessageSubmitted: false,
            },
          },
        });
        return attempt.id;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
    return getSendAttempt(sendAttemptId);
  } catch (error) {
    if (error instanceof EmailSandboxPolicyError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const raced = await prisma.sendAttempt.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (raced && samePrepareRequest(raced, input)) return getSendAttempt(raced.id);
      throw new EmailSandboxPolicyError(
        409,
        'Idempotency key was already used with a different request'
      );
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
      const raced = await prisma.sendAttempt.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (raced && samePrepareRequest(raced, input)) return getSendAttempt(raced.id);
      throw new EmailSandboxPolicyError(409, 'Send attempt changed concurrently; retry safely');
    }
    throw error;
  }
}

const FINAL_OR_ACCEPTED_STATUSES = new Set([
  'ACCEPTED',
  'DELIVERED',
  'BOUNCED',
  'COMPLAINED',
  'SUPPRESSED',
]);

async function dispatchSandboxSendAttempt(input: DispatchSandboxSendAttemptInput) {
  if (input.provider.provider !== 'RESEND') {
    throw new EmailSandboxPolicyError(409, 'Provider does not match the prepared attempt');
  }
  const evaluatedAt = input.evaluatedAt ?? new Date();
  const start = await prisma.$transaction(
    async (tx) => {
      await lockSendAttempt(tx, input.sendAttemptId);
      const attempt = await tx.sendAttempt.findUnique({ where: { id: input.sendAttemptId } });
      if (!attempt) throw new EmailSandboxPolicyError(404, 'Send attempt not found');
      if (FINAL_OR_ACCEPTED_STATUSES.has(attempt.status)) return { alreadyAccepted: true as const };
      if (!['PREPARED', 'UNKNOWN'].includes(attempt.status)) {
        throw new EmailSandboxPolicyError(
          409,
          `Send attempt cannot dispatch from ${attempt.status}`
        );
      }
      if (attempt.expiresAt <= evaluatedAt)
        throw new EmailSandboxPolicyError(409, 'Send attempt is expired');
      const draft = await tx.outreachDraft.findUnique({ where: { id: attempt.draftId } });
      if (!draft) throw new EmailSandboxPolicyError(404, 'Outreach draft not found');
      const approval = await tx.outreachApproval.findUnique({
        where: { draftId: attempt.draftId },
      });
      const contactPoint = await tx.contactPoint.findUnique({
        where: { id: attempt.contactPointId },
      });
      const revisions = await tx.outreachDraftRevision.findMany({
        where: { draftId: attempt.draftId },
      });
      if (!contactPoint) throw new EmailSandboxPolicyError(404, 'Contact point not found');
      const revision = revisions.find(
        (candidate) => candidate.revisionNumber === draft.currentRevisionNumber
      );
      if (
        draft.status !== 'APPROVED' ||
        draft.expiresAt <= evaluatedAt ||
        !approval ||
        approval.decision !== 'APPROVED' ||
        !revision ||
        approval.id !== attempt.approvalId ||
        approval.revisionId !== attempt.revisionId ||
        approval.contentHash !== attempt.contentHash ||
        revision.id !== attempt.revisionId ||
        revision.contentHash !== attempt.contentHash
      ) {
        throw new EmailSandboxPolicyError(409, 'Approval or revision is no longer dispatchable');
      }
      const snapshot = asJsonObject(draft.recipientSnapshot, 'Recipient');
      const currentApprovedHash = buildRecipientHash('EMAIL', contactPoint.normalizedValue);
      if (
        snapshot.recipientHash !== attempt.approvedRecipientHash ||
        currentApprovedHash !== attempt.approvedRecipientHash
      ) {
        throw new EmailSandboxPolicyError(409, 'Approved recipient changed after preparation');
      }
      await lockContactPoint(tx, attempt.contactPointId);
      const gate = await evaluateExactGate(tx, {
        contactPointId: attempt.contactPointId,
        purpose: draft.purpose,
        jurisdictionCountry: draft.jurisdictionCountry,
        policyVersion: draft.policyVersion,
        expectedPermissionId: attempt.permissionId,
        evaluatedAt,
        stage: 'DISPATCH',
      });
      const providerInput = {
        sendAttemptId: attempt.id,
        idempotencyKey: attempt.idempotencyKey,
        scenario: attempt.scenario,
      };
      const providerPayloadHash = input.provider.payloadHash(providerInput);
      if (attempt.providerPayloadHash && attempt.providerPayloadHash !== providerPayloadHash) {
        throw new EmailSandboxPolicyError(
          409,
          'Provider payload changed for an existing idempotency key'
        );
      }
      await tx.sendAttempt.update({
        where: { id: attempt.id },
        data: {
          status: 'DISPATCHING',
          providerPayloadHash,
          attemptCount: { increment: 1 },
          providerCallPerformed: false,
          testMessageSubmitted: false,
          dispatchStartedAt: evaluatedAt,
          failureCode: null,
          failedAt: null,
        },
      });
      await tx.event.create({
        data: {
          type: 'TEST_PROVIDER_DISPATCH_STARTED',
          entityType: 'SendAttempt',
          entityId: attempt.id,
          actor: attempt.requestedBy,
          occurredAt: evaluatedAt,
          metadata: {
            provider: 'RESEND',
            recipientMode: 'TEST_SIMULATION',
            scenario: attempt.scenario,
            dispatchGate: gate.receipt,
            providerCallPerformed: false,
            customerMessageSubmitted: false,
          },
        },
      });
      return { alreadyAccepted: false as const, attempt };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
  if (start.alreadyAccepted) return getSendAttempt(input.sendAttemptId);

  try {
    const result = await input.provider.dispatch({
      sendAttemptId: start.attempt.id,
      idempotencyKey: start.attempt.idempotencyKey,
      scenario: start.attempt.scenario,
    });
    const acceptedAt = new Date();
    await prisma.$transaction(async (tx) => {
      await lockSendAttempt(tx, start.attempt.id);
      const current = await tx.sendAttempt.findUniqueOrThrow({ where: { id: start.attempt.id } });
      if (FINAL_OR_ACCEPTED_STATUSES.has(current.status)) {
        if (current.providerMessageId === result.providerMessageId) return;
        throw new EmailSandboxPolicyError(
          409,
          'Provider response conflicts with the signed webhook correlation receipt'
        );
      }
      if (!['DISPATCHING', 'UNKNOWN'].includes(current.status)) {
        throw new EmailSandboxPolicyError(
          409,
          'Send attempt changed while provider call was in flight'
        );
      }
      await tx.sendAttempt.update({
        where: { id: current.id },
        data: {
          status: 'ACCEPTED',
          providerMessageId: result.providerMessageId,
          providerCallPerformed: true,
          testMessageSubmitted: true,
          providerAcceptedAt: acceptedAt,
          failureCode: null,
          failedAt: null,
        },
      });
      await tx.event.create({
        data: {
          type: 'TEST_PROVIDER_ACCEPTED',
          entityType: 'SendAttempt',
          entityId: current.id,
          actor: current.requestedBy,
          occurredAt: acceptedAt,
          metadata: {
            provider: 'RESEND',
            providerMessageId: result.providerMessageId,
            testMessageSubmitted: true,
            customerMessageSubmitted: false,
          },
        },
      });
    });
  } catch (error) {
    if (error instanceof EmailSandboxPolicyError) throw error;
    const providerError =
      error instanceof ProviderDispatchError
        ? error
        : new ProviderDispatchError('UNKNOWN', 'PROVIDER_FINALIZATION_OUTCOME_UNKNOWN');
    const recordedAt = new Date();
    await prisma.$transaction(async (tx) => {
      await lockSendAttempt(tx, start.attempt.id);
      const current = await tx.sendAttempt.findUniqueOrThrow({ where: { id: start.attempt.id } });
      if (current.status !== 'DISPATCHING') return;
      const unknown = providerError.outcome === 'UNKNOWN';
      await tx.sendAttempt.update({
        where: { id: current.id },
        data: {
          status: unknown ? 'UNKNOWN' : 'FAILED',
          providerCallPerformed: true,
          testMessageSubmitted: unknown ? null : false,
          failureCode: providerError.code,
          failedAt: unknown ? null : recordedAt,
        },
      });
      await tx.event.create({
        data: {
          type: unknown ? 'TEST_PROVIDER_OUTCOME_UNKNOWN' : 'TEST_PROVIDER_FAILED',
          entityType: 'SendAttempt',
          entityId: current.id,
          actor: current.requestedBy,
          occurredAt: recordedAt,
          metadata: {
            provider: 'RESEND',
            failureCode: providerError.code,
            providerCallPerformed: true,
            testMessageSubmitted: unknown ? null : false,
            customerMessageSubmitted: false,
          },
        },
      });
    });
  }
  return getSendAttempt(start.attempt.id);
}

export async function recoverStaleSandboxDispatch(input: {
  sendAttemptId: string;
  recoveredBy: string;
  evaluatedAt?: Date;
}) {
  if (
    input.recoveredBy.length < 1 ||
    input.recoveredBy.length > 128 ||
    !SAFE_ACTOR_PATTERN.test(input.recoveredBy)
  ) {
    throw new EmailSandboxPolicyError(400, 'Invalid recoveredBy actor');
  }
  const evaluatedAt = input.evaluatedAt ?? new Date();
  const staleBefore = new Date(evaluatedAt.getTime() - STALE_DISPATCH_LEASE_MINUTES * 60 * 1_000);
  await prisma.$transaction(
    async (tx) => {
      await lockSendAttempt(tx, input.sendAttemptId);
      const attempt = await tx.sendAttempt.findUnique({ where: { id: input.sendAttemptId } });
      if (!attempt) throw new EmailSandboxPolicyError(404, 'Send attempt not found');
      if (
        attempt.status !== 'DISPATCHING' ||
        !attempt.dispatchStartedAt ||
        attempt.dispatchStartedAt > staleBefore
      ) {
        throw new EmailSandboxPolicyError(409, 'Send attempt has no stale dispatch lease');
      }
      await tx.sendAttempt.update({
        where: { id: attempt.id },
        data: {
          status: 'UNKNOWN',
          providerCallPerformed: true,
          testMessageSubmitted: null,
          failureCode: 'STALE_DISPATCH_OUTCOME_UNKNOWN',
        },
      });
      await tx.event.create({
        data: {
          type: 'TEST_PROVIDER_OUTCOME_UNKNOWN',
          entityType: 'SendAttempt',
          entityId: attempt.id,
          actor: input.recoveredBy,
          occurredAt: evaluatedAt,
          metadata: {
            provider: 'RESEND',
            failureCode: 'STALE_DISPATCH_OUTCOME_UNKNOWN',
            providerCallPerformed: true,
            testMessageSubmitted: null,
            customerMessageSubmitted: false,
          },
        },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
  return getSendAttempt(input.sendAttemptId);
}

const resendWebhookSchema = z
  .object({
    type: z
      .string()
      .regex(/^email\.[a-z_]+$/)
      .max(100),
    created_at: z.string().datetime(),
    data: z
      .object({
        email_id: z
          .string()
          .min(1)
          .max(200)
          .regex(/^[A-Za-z0-9_-]+$/),
        created_at: z.string().datetime().optional(),
        from: z.string().min(1).max(500).optional(),
        to: z.array(z.string().min(1).max(500)).max(50).optional(),
        subject: z.string().max(2_000).optional(),
        message_id: z.string().max(1_000).optional(),
        attachments: z.array(z.unknown()).max(100).optional(),
        tags: z
          .record(z.string().min(1).max(256))
          .refine((value) => Object.keys(value).length <= 75)
          .optional(),
      })
      .passthrough(),
  })
  .passthrough();

export type ResendWebhookEvent = z.infer<typeof resendWebhookSchema>;

export function parseResendWebhookPayload(rawPayload: string): ResendWebhookEvent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawPayload);
  } catch {
    throw new EmailSandboxPolicyError(400, 'Webhook payload is not valid JSON');
  }
  const result = resendWebhookSchema.safeParse(parsed);
  if (!result.success) throw new EmailSandboxPolicyError(400, 'Webhook payload shape is invalid');
  return result.data;
}

const DELIVERY_EVENT_TYPES: Record<
  string,
  'SENT' | 'DELIVERED' | 'BOUNCED' | 'COMPLAINED' | 'SUPPRESSED' | 'FAILED' | 'DELIVERY_DELAYED'
> = {
  'email.sent': 'SENT',
  'email.delivered': 'DELIVERED',
  'email.bounced': 'BOUNCED',
  'email.complained': 'COMPLAINED',
  'email.suppressed': 'SUPPRESSED',
  'email.failed': 'FAILED',
  'email.delivery_delayed': 'DELIVERY_DELAYED',
};

function nextAggregateStatus(current: string, eventType: string) {
  if (eventType === 'DELIVERED' && current === 'ACCEPTED') return 'DELIVERED' as const;
  if (eventType === 'BOUNCED' && current === 'ACCEPTED') return 'BOUNCED' as const;
  if (eventType === 'SUPPRESSED' && current === 'ACCEPTED') return 'SUPPRESSED' as const;
  if (eventType === 'COMPLAINED' && ['ACCEPTED', 'DELIVERED'].includes(current)) {
    return 'COMPLAINED' as const;
  }
  if (eventType === 'FAILED' && current === 'ACCEPTED') return 'FAILED' as const;
  return null;
}

export type ProcessResendWebhookInput = {
  providerEventId: string;
  rawPayload: string;
  event: ResendWebhookEvent;
  receivedAt?: Date;
};

function assertWebhookRecipientMatchesAttempt(
  event: ResendWebhookEvent,
  attempt: { recipientHash: string }
) {
  if (!event.data.to || event.data.to.length !== 1) {
    throw new EmailSandboxPolicyError(409, 'Webhook recipient does not match the send attempt');
  }
  let recipientHash: string;
  try {
    const normalizedRecipient = normalizeContactPointValue('EMAIL', event.data.to[0]);
    recipientHash = buildRecipientHash('EMAIL', normalizedRecipient);
  } catch {
    throw new EmailSandboxPolicyError(409, 'Webhook recipient does not match the send attempt');
  }
  if (recipientHash !== attempt.recipientHash) {
    throw new EmailSandboxPolicyError(409, 'Webhook recipient does not match the send attempt');
  }
}

async function duplicateWebhookResult(input: ProcessResendWebhookInput, payloadHash: string) {
  const existing = await prisma.providerWebhookReceipt.findUnique({
    where: {
      provider_providerEventId: { provider: 'RESEND', providerEventId: input.providerEventId },
    },
  });
  if (!existing) return null;
  if (existing.payloadHash !== payloadHash || existing.eventType !== input.event.type) {
    throw new EmailSandboxPolicyError(409, 'Webhook event id was reused with different content');
  }
  return { status: 'duplicate' as const, receiptId: existing.id };
}

export async function processResendWebhook(input: ProcessResendWebhookInput) {
  // Receiving is deliberately out of scope for Phase 5. Do not create an
  // append-only row for a public SMTP input that an unauthenticated sender can amplify.
  if (input.event.type === 'email.received') return { status: 'ignored' as const };
  const payloadHash = sha256(input.rawPayload);
  const duplicate = await duplicateWebhookResult(input, payloadHash);
  if (duplicate) return duplicate;
  const receivedAt = input.receivedAt ?? new Date();
  const providerCreatedAt = new Date(input.event.created_at);
  const deliveryType = DELIVERY_EVENT_TYPES[input.event.type];

  try {
    return await prisma.$transaction(
      async (tx) => {
        let attempt = deliveryType
          ? await tx.sendAttempt.findUnique({
              where: { providerMessageId: input.event.data.email_id },
            })
          : null;
        const taggedAttemptId = input.event.data.tags?.send_attempt_id;
        if (attempt && taggedAttemptId && taggedAttemptId !== attempt.id) {
          throw new EmailSandboxPolicyError(
            409,
            'Webhook provider id and send-attempt tag disagree'
          );
        }
        if (attempt) assertWebhookRecipientMatchesAttempt(input.event, attempt);
        if (deliveryType && !attempt && taggedAttemptId) {
          if (!/^[A-Za-z0-9_-]{1,256}$/.test(taggedAttemptId)) {
            throw new EmailSandboxPolicyError(400, 'Webhook send-attempt tag is invalid');
          }
          await lockSendAttempt(tx, taggedAttemptId);
          const taggedAttempt = await tx.sendAttempt.findUnique({
            where: { id: taggedAttemptId },
          });
          if (taggedAttempt) {
            assertWebhookRecipientMatchesAttempt(input.event, taggedAttempt);
            if (
              taggedAttempt.providerMessageId &&
              taggedAttempt.providerMessageId !== input.event.data.email_id
            ) {
              throw new EmailSandboxPolicyError(
                409,
                'Webhook provider id conflicts with the attempt receipt'
              );
            }
            if (!taggedAttempt.providerMessageId) {
              if (!['DISPATCHING', 'UNKNOWN'].includes(taggedAttempt.status)) {
                throw new EmailSandboxPolicyError(
                  409,
                  'Tagged send attempt is not awaiting provider correlation'
                );
              }
              const acceptedAt =
                receivedAt < taggedAttempt.preparedAt ? taggedAttempt.preparedAt : receivedAt;
              await tx.sendAttempt.update({
                where: { id: taggedAttempt.id },
                data: {
                  status: 'ACCEPTED',
                  providerMessageId: input.event.data.email_id,
                  providerCallPerformed: true,
                  testMessageSubmitted: true,
                  providerAcceptedAt: acceptedAt,
                  failureCode: null,
                },
              });
              await tx.event.create({
                data: {
                  type: 'TEST_PROVIDER_ACCEPTED',
                  entityType: 'SendAttempt',
                  entityId: taggedAttempt.id,
                  actor: 'resend-signed-webhook',
                  occurredAt: acceptedAt,
                  metadata: {
                    provider: 'RESEND',
                    providerMessageId: input.event.data.email_id,
                    correlatedBy: 'SEND_ATTEMPT_TAG',
                    testMessageSubmitted: true,
                    customerMessageSubmitted: false,
                  },
                },
              });
            }
            attempt = await tx.sendAttempt.findUniqueOrThrow({
              where: { id: taggedAttempt.id },
            });
          }
        }

        const outcome = deliveryType && attempt ? 'PROCESSED' : 'IGNORED';
        const receipt = await tx.providerWebhookReceipt.create({
          data: {
            provider: 'RESEND',
            providerEventId: input.providerEventId,
            eventType: input.event.type,
            payloadHash,
            providerCreatedAt,
            receivedAt,
            outcome,
          },
        });
        if (!deliveryType || !attempt) {
          return { status: 'ignored' as const, receiptId: receipt.id };
        }

        const aggregateStatus = nextAggregateStatus(attempt.status, deliveryType);
        const deliveryEvent = await tx.deliveryEvent.create({
          data: {
            sendAttemptId: attempt.id,
            webhookReceiptId: receipt.id,
            type: deliveryType,
            providerMessageId: input.event.data.email_id,
            recipientHash: attempt.recipientHash,
            receipt: {
              provider: 'RESEND',
              providerEventId: input.providerEventId,
              aggregateTransitionApplied: aggregateStatus !== null,
              rawPayloadStored: false,
              rawRecipientStored: false,
              customerMessageSubmitted: false,
            },
            occurredAt: providerCreatedAt,
          },
        });

        if (aggregateStatus) {
          await tx.sendAttempt.update({
            where: { id: attempt.id },
            data:
              aggregateStatus === 'FAILED'
                ? {
                    status: aggregateStatus,
                    failureCode: 'PROVIDER_WEBHOOK_FAILED',
                    failedAt: providerCreatedAt,
                  }
                : { status: aggregateStatus },
          });
        }
        if (['BOUNCED', 'COMPLAINED', 'SUPPRESSED'].includes(deliveryType)) {
          await tx.suppressionEntry.upsert({
            where: {
              channel_recipientHash: { channel: 'EMAIL', recipientHash: attempt.recipientHash },
            },
            update: {},
            create: {
              channel: 'EMAIL',
              recipientHash: attempt.recipientHash,
              reason: `RESEND_TEST_${deliveryType}`,
              source: 'RESEND_SIGNED_WEBHOOK_TEST',
              recordedBy: 'resend-signed-webhook',
            },
          });
        }
        await tx.event.create({
          data: {
            type: 'DELIVERY_EVENT_RECORDED',
            entityType: 'DeliveryEvent',
            entityId: deliveryEvent.id,
            actor: 'resend-signed-webhook',
            occurredAt: providerCreatedAt,
            metadata: {
              sendAttemptId: attempt.id,
              deliveryType,
              aggregateStatus,
              rawPayloadStored: false,
              rawRecipientStored: false,
              customerMessageSubmitted: false,
            },
          },
        });
        return { status: 'processed' as const, receiptId: receipt.id };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  } catch (error) {
    if (error instanceof EmailSandboxPolicyError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const raced = await duplicateWebhookResult(input, payloadHash);
      if (raced) return raced;
      throw new EmailSandboxPolicyError(409, 'Webhook event changed concurrently');
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
      throw new EmailSandboxPolicyError(
        409,
        'Webhook processing changed concurrently; retry safely'
      );
    }
    throw error;
  }
}
