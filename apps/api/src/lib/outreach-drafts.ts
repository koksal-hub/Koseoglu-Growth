import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { buildRecipientHash, evaluateCommunicationGate } from './contact-points';
import { prisma } from './prisma';

export const MAX_DRAFT_LIFETIME_DAYS = 30;
export const MAX_RANKING_RECEIPT_AGE_HOURS = 24;
export const MAX_OUTREACH_DRAFT_LIST = 100;

type CommunicationPurpose = 'SALES_OUTREACH' | 'MARKETING' | 'CUSTOMER_SERVICE';
type ApprovalDecision = 'APPROVED' | 'REJECTED';

export type CreateOutreachDraftInput = {
  companyId: string;
  contactPointId: string;
  rankingReceiptId: string;
  purpose: CommunicationPurpose;
  jurisdictionCountry: string;
  policyVersion: string;
  templateKey: string;
  templateVersion: string;
  subject: string;
  body: string;
  author: string;
  expiresAt: Date;
};

export type ReviseOutreachDraftInput = {
  draftId: string;
  expectedRevisionNumber: number;
  subject: string;
  body: string;
  editedBy: string;
  editReason: string;
};

export type SubmitOutreachDraftInput = {
  draftId: string;
  submittedBy: string;
};

export type DecideOutreachDraftInput = {
  draftId: string;
  expectedRevisionNumber: number;
  decision: ApprovalDecision;
  decisionReason: string;
  reviewedBy: string;
};

export type ExpireOutreachDraftInput = {
  draftId: string;
  expiredBy: string;
};

export class OutreachPolicyError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'OutreachPolicyError';
    this.statusCode = statusCode;
  }
}

const outreachDraftInclude = {
  company: { select: { id: true, name: true } },
  contactPoint: {
    select: {
      id: true,
      type: true,
      classification: true,
      countryCode: true,
      verificationStatus: true,
    },
  },
  rankingReceipt: {
    select: {
      id: true,
      algorithmVersion: true,
      policyVersion: true,
      inputHash: true,
      nextAction: true,
      evaluatedAt: true,
    },
  },
  revisions: { orderBy: { revisionNumber: 'asc' as const } },
  approval: { include: { permission: true } },
} as const;

type Transaction = Prisma.TransactionClient;
type MutationDraftRecord = Prisma.OutreachDraftGetPayload<Record<string, never>> & {
  revisions: Prisma.OutreachDraftRevisionGetPayload<Record<string, never>>[];
};

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function contentHash(
  templateKey: string,
  templateVersion: string,
  subject: string,
  body: string
): string {
  return sha256({ templateKey, templateVersion, subject, body });
}

function asObject(value: Prisma.JsonValue): Record<string, Prisma.JsonValue> {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new OutreachPolicyError(409, 'Ranking context receipt is malformed');
  }
  return value as Record<string, Prisma.JsonValue>;
}

function normalizeCountry(value: string): string {
  return value.normalize('NFKC').trim().toUpperCase();
}

async function lockContactPoint(tx: Transaction, contactPointId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT "id" FROM "ContactPoint" WHERE "id" = ${contactPointId} FOR UPDATE`
  );
  if (rows.length !== 1) throw new OutreachPolicyError(404, 'Contact point not found');
}

async function getDraftInTransaction(
  tx: Transaction,
  draftId: string
): Promise<MutationDraftRecord> {
  const draft = await tx.outreachDraft.findUnique({ where: { id: draftId } });
  if (!draft) throw new OutreachPolicyError(404, 'Outreach draft not found');
  const revisions = await tx.outreachDraftRevision.findMany({
    where: { draftId },
    orderBy: { revisionNumber: 'asc' },
  });
  return { ...draft, revisions };
}

async function getLatestRevision(tx: Transaction, draft: MutationDraftRecord) {
  const revision = draft.revisions.find(
    (candidate) => candidate.revisionNumber === draft.currentRevisionNumber
  );
  if (!revision) throw new OutreachPolicyError(409, 'Current draft revision is missing');
  return revision;
}

async function assertCurrentReadyRanking(
  tx: Transaction,
  input: Pick<
    CreateOutreachDraftInput,
    'companyId' | 'contactPointId' | 'rankingReceiptId' | 'purpose' | 'jurisdictionCountry'
  >,
  evaluatedAt: Date
) {
  const receipt = await tx.companyRankingReceipt.findUnique({
    where: { id: input.rankingReceiptId },
  });
  if (!receipt || receipt.companyId !== input.companyId) {
    throw new OutreachPolicyError(409, 'Ranking receipt does not belong to the selected company');
  }
  const latest = await tx.companyRankingReceipt.findFirst({
    where: { companyId: input.companyId },
    orderBy: [{ evaluatedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
  });
  if (!latest || latest.id !== receipt.id) {
    throw new OutreachPolicyError(
      409,
      'Only the latest company ranking receipt can create a draft'
    );
  }
  if (receipt.nextAction !== 'READY_FOR_HUMAN_OUTREACH_REVIEW') {
    throw new OutreachPolicyError(409, 'Ranking receipt is not ready for human outreach review');
  }
  const maxAgeMs = MAX_RANKING_RECEIPT_AGE_HOURS * 60 * 60 * 1000;
  if (receipt.evaluatedAt.getTime() > evaluatedAt.getTime() + 5 * 60 * 1000) {
    throw new OutreachPolicyError(409, 'Ranking receipt evaluation time is in the future');
  }
  if (evaluatedAt.getTime() - receipt.evaluatedAt.getTime() > maxAgeMs) {
    throw new OutreachPolicyError(409, 'Ranking receipt is too old for draft creation');
  }
  const context = asObject(receipt.context);
  if (
    context.channel !== 'EMAIL' ||
    context.purpose !== input.purpose ||
    context.jurisdictionCountry !== normalizeCountry(input.jurisdictionCountry)
  ) {
    throw new OutreachPolicyError(
      409,
      'Draft communication context does not match the ranking receipt'
    );
  }
  const contactReceipt = Array.isArray(receipt.contactReceipt) ? receipt.contactReceipt : [];
  const selectedContactWasReady = contactReceipt.some((value) => {
    if (!value || Array.isArray(value) || typeof value !== 'object') return false;
    const item = value as Record<string, Prisma.JsonValue>;
    return item.contactPointId === input.contactPointId && item.gateDecision === 'ALLOW';
  });
  if (!selectedContactWasReady) {
    throw new OutreachPolicyError(
      409,
      'Selected contact point was not ready in the ranking receipt'
    );
  }
  return receipt;
}

async function evaluateDraftGate(
  tx: Transaction,
  draft: Pick<
    MutationDraftRecord,
    'contactPointId' | 'purpose' | 'jurisdictionCountry' | 'policyVersion'
  >,
  evaluatedAt: Date,
  stage: 'CREATE' | 'REVIEW' | 'DECISION',
  requireAllow: boolean
) {
  const gate = await evaluateCommunicationGate(
    {
      contactPointId: draft.contactPointId,
      channel: 'EMAIL',
      purpose: draft.purpose,
      jurisdictionCountry: draft.jurisdictionCountry,
      evaluatedAt,
    },
    tx
  );
  const permission = gate.permissionId
    ? await tx.communicationPermission.findUnique({ where: { id: gate.permissionId } })
    : null;
  const policyMatches = permission?.policyVersion === draft.policyVersion;
  const reasons = [...gate.reasons];
  if (gate.allowed && !policyMatches) reasons.push('PERMISSION_POLICY_VERSION_CHANGED');
  const allowed = gate.allowed && policyMatches;
  const receipt = {
    stage,
    decision: allowed ? ('ALLOW' as const) : ('DENY' as const),
    reasons: Array.from(new Set(reasons)),
    contactPointId: draft.contactPointId,
    channel: 'EMAIL' as const,
    purpose: draft.purpose,
    jurisdictionCountry: draft.jurisdictionCountry,
    permissionId: permission?.id ?? null,
    permissionStatus: permission?.status ?? null,
    permissionPolicyVersion: permission?.policyVersion ?? null,
    permissionCheckedAt: permission?.checkedAt.toISOString() ?? null,
    permissionExpiresAt: permission?.expiresAt?.toISOString() ?? null,
    evaluatedAt: evaluatedAt.toISOString(),
    rawRecipientStored: false,
    actualSendPerformed: false,
  };
  if (requireAllow && !allowed) {
    throw new OutreachPolicyError(
      409,
      `Communication gate denied: ${receipt.reasons.join(', ') || 'POLICY_MISMATCH'}`
    );
  }
  return { allowed, permission, receipt };
}

function mapConcurrencyError(error: unknown): never {
  if (error instanceof OutreachPolicyError) throw error;
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    ['P2002', 'P2034'].includes(error.code)
  ) {
    throw new OutreachPolicyError(409, 'Outreach draft changed concurrently; reload and retry');
  }
  throw error;
}

export async function getOutreachDraft(draftId: string) {
  const draft = await prisma.outreachDraft.findUnique({
    where: { id: draftId },
    include: outreachDraftInclude,
  });
  if (!draft) throw new OutreachPolicyError(404, 'Outreach draft not found');
  return draft;
}

export async function listCompanyOutreachDrafts(companyId: string, limit = 50) {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_OUTREACH_DRAFT_LIST) {
    throw new OutreachPolicyError(
      400,
      `limit must be an integer from 1 to ${MAX_OUTREACH_DRAFT_LIST}`
    );
  }
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true },
  });
  if (!company) throw new OutreachPolicyError(404, 'Company not found');
  return prisma.outreachDraft.findMany({
    where: { companyId },
    include: outreachDraftInclude,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit,
  });
}

export async function createOutreachDraft(input: CreateOutreachDraftInput) {
  const evaluatedAt = new Date();
  const maxExpiry = evaluatedAt.getTime() + MAX_DRAFT_LIFETIME_DAYS * 86_400_000;
  if (
    input.expiresAt.getTime() <= evaluatedAt.getTime() + 60_000 ||
    input.expiresAt.getTime() > maxExpiry
  ) {
    throw new OutreachPolicyError(
      400,
      `expiresAt must be 1 minute to ${MAX_DRAFT_LIFETIME_DAYS} days in the future`
    );
  }
  const jurisdictionCountry = normalizeCountry(input.jurisdictionCountry);
  try {
    const draftId = await prisma.$transaction(
      async (tx) => {
        const company = await tx.company.findUnique({
          where: { id: input.companyId },
          select: { status: true, mergedIntoId: true },
        });
        if (!company || company.status !== 'ACTIVE' || company.mergedIntoId) {
          throw new OutreachPolicyError(404, 'Active canonical company not found');
        }
        await lockContactPoint(tx, input.contactPointId);
        const contactPoint = await tx.contactPoint.findUnique({
          where: { id: input.contactPointId },
        });
        if (
          !contactPoint ||
          contactPoint.companyId !== input.companyId ||
          contactPoint.type !== 'EMAIL'
        ) {
          throw new OutreachPolicyError(
            409,
            'Selected email contact point does not belong to the company'
          );
        }
        const ranking = await assertCurrentReadyRanking(
          tx,
          { ...input, jurisdictionCountry },
          evaluatedAt
        );
        const gate = await evaluateDraftGate(
          tx,
          { ...input, jurisdictionCountry },
          evaluatedAt,
          'CREATE',
          true
        );
        const revisionHash = contentHash(
          input.templateKey,
          input.templateVersion,
          input.subject,
          input.body
        );
        const recipientSnapshot = {
          contactPointId: contactPoint.id,
          recipientHash: buildRecipientHash('EMAIL', contactPoint.normalizedValue),
          type: contactPoint.type,
          classification: contactPoint.classification,
          countryCode: contactPoint.countryCode,
          verificationStatus: contactPoint.verificationStatus,
          permissionId: gate.permission?.id ?? null,
          permissionPolicyVersion: gate.permission?.policyVersion ?? null,
          rankingReceiptId: ranking.id,
          capturedAt: evaluatedAt.toISOString(),
          rawRecipientStored: false,
        };
        const draft = await tx.outreachDraft.create({
          data: {
            companyId: input.companyId,
            contactPointId: input.contactPointId,
            rankingReceiptId: input.rankingReceiptId,
            channel: 'EMAIL',
            purpose: input.purpose,
            jurisdictionCountry,
            policyVersion: input.policyVersion,
            templateKey: input.templateKey,
            templateVersion: input.templateVersion,
            generationMethod: 'HUMAN_AUTHORED',
            author: input.author,
            recipientSnapshot,
            expiresAt: input.expiresAt,
            revisions: {
              create: {
                revisionNumber: 1,
                subject: input.subject,
                body: input.body,
                contentHash: revisionHash,
                editedBy: input.author,
                editReason: 'INITIAL_DRAFT',
              },
            },
          },
        });
        await tx.event.create({
          data: {
            type: 'OUTREACH_DRAFT_CREATED',
            entityType: 'OutreachDraft',
            entityId: draft.id,
            actor: input.author,
            metadata: {
              companyId: input.companyId,
              contactPointId: input.contactPointId,
              rankingReceiptId: input.rankingReceiptId,
              contentHash: revisionHash,
              gateReceipt: gate.receipt,
              generationMethod: 'HUMAN_AUTHORED',
              actualSendPerformed: false,
            },
          },
        });
        return draft.id;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
    return getOutreachDraft(draftId);
  } catch (error) {
    mapConcurrencyError(error);
  }
}

export async function reviseOutreachDraft(input: ReviseOutreachDraftInput) {
  try {
    const draftId = await prisma.$transaction(
      async (tx) => {
        const draft = await getDraftInTransaction(tx, input.draftId);
        if (draft.status !== 'DRAFT')
          throw new OutreachPolicyError(409, 'Only DRAFT content can be revised');
        if (draft.expiresAt <= new Date())
          throw new OutreachPolicyError(409, 'Expired draft cannot be revised');
        if (draft.currentRevisionNumber !== input.expectedRevisionNumber) {
          throw new OutreachPolicyError(409, 'Draft revision changed; reload before editing');
        }
        const current = await getLatestRevision(tx, draft);
        const nextHash = contentHash(
          draft.templateKey,
          draft.templateVersion,
          input.subject,
          input.body
        );
        if (nextHash === current.contentHash)
          throw new OutreachPolicyError(409, 'Revision content is unchanged');
        const nextRevisionNumber = draft.currentRevisionNumber + 1;
        const updated = await tx.outreachDraft.updateMany({
          where: {
            id: draft.id,
            status: 'DRAFT',
            currentRevisionNumber: input.expectedRevisionNumber,
          },
          data: { currentRevisionNumber: nextRevisionNumber },
        });
        if (updated.count !== 1)
          throw new OutreachPolicyError(409, 'Draft changed concurrently; reload and retry');
        await tx.outreachDraftRevision.create({
          data: {
            draftId: draft.id,
            revisionNumber: nextRevisionNumber,
            subject: input.subject,
            body: input.body,
            contentHash: nextHash,
            editedBy: input.editedBy,
            editReason: input.editReason,
          },
        });
        await tx.event.create({
          data: {
            type: 'OUTREACH_DRAFT_REVISED',
            entityType: 'OutreachDraft',
            entityId: draft.id,
            actor: input.editedBy,
            metadata: {
              previousRevisionNumber: input.expectedRevisionNumber,
              revisionNumber: nextRevisionNumber,
              contentHash: nextHash,
              actualSendPerformed: false,
            },
          },
        });
        return draft.id;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
    return getOutreachDraft(draftId);
  } catch (error) {
    mapConcurrencyError(error);
  }
}

export async function submitOutreachDraftForReview(input: SubmitOutreachDraftInput) {
  try {
    const draftId = await prisma.$transaction(
      async (tx) => {
        const draft = await getDraftInTransaction(tx, input.draftId);
        if (draft.status !== 'DRAFT')
          throw new OutreachPolicyError(409, 'Only DRAFT content can enter review');
        const evaluatedAt = new Date();
        if (draft.expiresAt <= evaluatedAt)
          throw new OutreachPolicyError(409, 'Expired draft cannot enter review');
        await lockContactPoint(tx, draft.contactPointId);
        const gate = await evaluateDraftGate(tx, draft, evaluatedAt, 'REVIEW', true);
        const updated = await tx.outreachDraft.updateMany({
          where: {
            id: draft.id,
            status: 'DRAFT',
            currentRevisionNumber: draft.currentRevisionNumber,
          },
          data: { status: 'IN_REVIEW', submittedAt: evaluatedAt, submittedBy: input.submittedBy },
        });
        if (updated.count !== 1)
          throw new OutreachPolicyError(409, 'Draft changed concurrently; reload and retry');
        await tx.event.create({
          data: {
            type: 'OUTREACH_REVIEW_REQUESTED',
            entityType: 'OutreachDraft',
            entityId: draft.id,
            actor: input.submittedBy,
            metadata: {
              revisionNumber: draft.currentRevisionNumber,
              gateReceipt: gate.receipt,
              actualSendPerformed: false,
            },
          },
        });
        return draft.id;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
    return getOutreachDraft(draftId);
  } catch (error) {
    mapConcurrencyError(error);
  }
}

export async function decideOutreachDraft(input: DecideOutreachDraftInput) {
  try {
    const draftId = await prisma.$transaction(
      async (tx) => {
        const draft = await getDraftInTransaction(tx, input.draftId);
        if (draft.status !== 'IN_REVIEW')
          throw new OutreachPolicyError(409, 'Only IN_REVIEW drafts can be decided');
        if (draft.currentRevisionNumber !== input.expectedRevisionNumber) {
          throw new OutreachPolicyError(409, 'Review revision changed; reload before deciding');
        }
        const evaluatedAt = new Date();
        if (draft.expiresAt <= evaluatedAt) {
          throw new OutreachPolicyError(
            409,
            'Draft is expired; record expiration instead of a decision'
          );
        }
        const contentAuthors = new Set([
          draft.author,
          ...draft.revisions.map((revision) => revision.editedBy),
        ]);
        if (contentAuthors.has(input.reviewedBy)) {
          throw new OutreachPolicyError(
            409,
            'Reviewer must be independent from every content author'
          );
        }
        const revision = await getLatestRevision(tx, draft);
        await lockContactPoint(tx, draft.contactPointId);
        const gate = await evaluateDraftGate(
          tx,
          draft,
          evaluatedAt,
          'DECISION',
          input.decision === 'APPROVED'
        );
        const updated = await tx.outreachDraft.updateMany({
          where: {
            id: draft.id,
            status: 'IN_REVIEW',
            currentRevisionNumber: input.expectedRevisionNumber,
          },
          data: { status: input.decision },
        });
        if (updated.count !== 1)
          throw new OutreachPolicyError(409, 'Draft changed concurrently; reload and retry');
        const approval = await tx.outreachApproval.create({
          data: {
            draftId: draft.id,
            revisionId: revision.id,
            decision: input.decision,
            decisionReason: input.decisionReason,
            reviewedBy: input.reviewedBy,
            policyVersion: draft.policyVersion,
            permissionId: gate.permission?.id,
            gateReceipt: gate.receipt,
            contentHash: revision.contentHash,
            decidedAt: evaluatedAt,
          },
        });
        await tx.event.create({
          data: {
            type: 'OUTREACH_APPROVAL_RECORDED',
            entityType: 'OutreachDraft',
            entityId: draft.id,
            actor: input.reviewedBy,
            metadata: {
              approvalId: approval.id,
              decision: input.decision,
              revisionNumber: revision.revisionNumber,
              contentHash: revision.contentHash,
              gateReceipt: gate.receipt,
              sendAuthorized: false,
              actualSendPerformed: false,
            },
          },
        });
        return draft.id;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
    return getOutreachDraft(draftId);
  } catch (error) {
    mapConcurrencyError(error);
  }
}

export async function expireOutreachDraft(input: ExpireOutreachDraftInput) {
  try {
    const draftId = await prisma.$transaction(
      async (tx) => {
        const draft = await getDraftInTransaction(tx, input.draftId);
        if (draft.status !== 'IN_REVIEW')
          throw new OutreachPolicyError(409, 'Only IN_REVIEW drafts can expire');
        const evaluatedAt = new Date();
        if (draft.expiresAt > evaluatedAt)
          throw new OutreachPolicyError(409, 'Draft has not reached expiresAt');
        const updated = await tx.outreachDraft.updateMany({
          where: { id: draft.id, status: 'IN_REVIEW' },
          data: { status: 'EXPIRED' },
        });
        if (updated.count !== 1)
          throw new OutreachPolicyError(409, 'Draft changed concurrently; reload and retry');
        await tx.event.create({
          data: {
            type: 'OUTREACH_DRAFT_EXPIRED',
            entityType: 'OutreachDraft',
            entityId: draft.id,
            actor: input.expiredBy,
            metadata: { expiredAt: evaluatedAt.toISOString(), actualSendPerformed: false },
          },
        });
        return draft.id;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
    return getOutreachDraft(draftId);
  } catch (error) {
    mapConcurrencyError(error);
  }
}
