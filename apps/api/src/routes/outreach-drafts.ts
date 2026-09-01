import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  createOutreachDraft,
  decideOutreachDraft,
  expireOutreachDraft,
  getOutreachDraft,
  listCompanyOutreachDrafts,
  MAX_DRAFT_LIFETIME_DAYS,
  OutreachPolicyError,
  reviseOutreachDraft,
  submitOutreachDraftForReview,
} from '../lib/outreach-drafts';

const idParamsSchema = z.object({ id: z.string().trim().min(1).max(64) }).strict();
const actorText = z.string().trim().min(1).max(120);
const policyVersion = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9._:-]+$/);
const countryCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/);
const purpose = z.enum(['SALES_OUTREACH', 'MARKETING', 'CUSTOMER_SERVICE']);
const status = z.enum(['DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED']);
const decision = z.enum(['APPROVED', 'REJECTED']);
const listQuerySchema = z
  .object({ limit: z.coerce.number().int().min(1).max(100).default(50) })
  .strict();

const createDraftSchema = z
  .object({
    contactPointId: z.string().trim().min(1).max(64),
    rankingReceiptId: z.string().trim().min(1).max(64),
    purpose,
    jurisdictionCountry: countryCode,
    policyVersion,
    templateKey: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(/^[A-Za-z0-9._:-]+$/),
    templateVersion: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(/^[A-Za-z0-9._:-]+$/),
    subject: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(20_000),
    author: actorText,
    expiresAt: z.coerce.date(),
  })
  .strict()
  .superRefine((value, context) => {
    const remaining = value.expiresAt.getTime() - Date.now();
    if (remaining <= 60_000 || remaining > MAX_DRAFT_LIFETIME_DAYS * 86_400_000) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expiresAt'],
        message: `expiresAt must be 1 minute to ${MAX_DRAFT_LIFETIME_DAYS} days in the future`,
      });
    }
  });

const reviseDraftSchema = z
  .object({
    expectedRevisionNumber: z.number().int().min(1).max(10_000),
    subject: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(20_000),
    editedBy: actorText,
    editReason: z.string().trim().min(1).max(1000),
  })
  .strict();

const submitDraftSchema = z.object({ submittedBy: actorText }).strict();
const decideDraftSchema = z
  .object({
    expectedRevisionNumber: z.number().int().min(1).max(10_000),
    decision,
    decisionReason: z.string().trim().min(1).max(1000),
    reviewedBy: actorText,
  })
  .strict();
const expireDraftSchema = z.object({ expiredBy: actorText }).strict();

const revisionResponseSchema = z.object({
  id: z.string(),
  revisionNumber: z.number().int().positive(),
  subject: z.string(),
  body: z.string(),
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  editedBy: z.string(),
  editReason: z.string(),
  createdAt: z.string(),
});

const permissionReceiptSchema = z
  .object({
    id: z.string(),
    status: z.enum(['ALLOWED', 'DENIED', 'OPTED_OUT', 'SUPPRESSED']),
    policyVersion: z.string(),
    checkedAt: z.string(),
    expiresAt: z.string().nullable(),
  })
  .nullable();

const approvalResponseSchema = z
  .object({
    id: z.string(),
    revisionId: z.string(),
    decision,
    decisionReason: z.string(),
    reviewedBy: z.string(),
    policyVersion: z.string(),
    permissionId: z.string().nullable(),
    permission: permissionReceiptSchema,
    gateReceipt: z.record(z.unknown()),
    contentHash: z.string().regex(/^[0-9a-f]{64}$/),
    decidedAt: z.string(),
    createdAt: z.string(),
  })
  .nullable();

const draftResponseSchema = z.object({
  id: z.string(),
  company: z.object({ id: z.string(), name: z.string() }),
  contactPoint: z.object({
    id: z.string(),
    type: z.literal('EMAIL'),
    classification: z.enum(['COMPANY_GENERAL', 'PERSON_WORK', 'PERSONAL', 'UNKNOWN']),
    countryCode: z.string(),
    verificationStatus: z.enum(['UNVERIFIED', 'VERIFIED', 'INVALID', 'STALE']),
  }),
  rankingReceipt: z.object({
    id: z.string(),
    algorithmVersion: z.string(),
    policyVersion: z.string(),
    inputHash: z.string().regex(/^[0-9a-f]{64}$/),
    nextAction: z.literal('READY_FOR_HUMAN_OUTREACH_REVIEW'),
    evaluatedAt: z.string(),
  }),
  channel: z.literal('EMAIL'),
  purpose,
  jurisdictionCountry: z.string(),
  policyVersion: z.string(),
  templateKey: z.string(),
  templateVersion: z.string(),
  generationMethod: z.literal('HUMAN_AUTHORED'),
  author: z.string(),
  recipientSnapshot: z.record(z.unknown()),
  status,
  currentRevisionNumber: z.number().int().positive(),
  expiresAt: z.string(),
  submittedAt: z.string().nullable(),
  submittedBy: z.string().nullable(),
  revisions: z.array(revisionResponseSchema),
  approval: approvalResponseSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  sendAuthorized: z.literal(false),
  providerCallPerformed: z.literal(false),
  actualSendPerformed: z.literal(false),
});

function parseRequest<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
    throw new OutreachPolicyError(400, `Invalid request: ${path}${issue.message}`);
  }
  return result.data;
}

type DraftRecord = Awaited<ReturnType<typeof getOutreachDraft>>;

function serializeDraft(draft: DraftRecord) {
  return draftResponseSchema.parse({
    ...draft,
    contactPoint: draft.contactPoint,
    rankingReceipt: {
      ...draft.rankingReceipt,
      evaluatedAt: draft.rankingReceipt.evaluatedAt.toISOString(),
    },
    expiresAt: draft.expiresAt.toISOString(),
    submittedAt: draft.submittedAt?.toISOString() ?? null,
    revisions: draft.revisions.map((revision) => ({
      ...revision,
      createdAt: revision.createdAt.toISOString(),
    })),
    approval: draft.approval
      ? {
          ...draft.approval,
          permission: draft.approval.permission
            ? {
                id: draft.approval.permission.id,
                status: draft.approval.permission.status,
                policyVersion: draft.approval.permission.policyVersion,
                checkedAt: draft.approval.permission.checkedAt.toISOString(),
                expiresAt: draft.approval.permission.expiresAt?.toISOString() ?? null,
              }
            : null,
          decidedAt: draft.approval.decidedAt.toISOString(),
          createdAt: draft.approval.createdAt.toISOString(),
        }
      : null,
    createdAt: draft.createdAt.toISOString(),
    updatedAt: draft.updatedAt.toISOString(),
    sendAuthorized: false,
    providerCallPerformed: false,
    actualSendPerformed: false,
  });
}

const outreachDraftRoutes: FastifyPluginAsync = async (server) => {
  server.post('/companies/:id/outreach-drafts', async (request, reply) => {
    const { id } = parseRequest(idParamsSchema, request.params);
    const input = parseRequest(createDraftSchema, request.body);
    const draft = await createOutreachDraft({ companyId: id, ...input });
    return reply.status(201).send(serializeDraft(draft));
  });

  server.get('/companies/:id/outreach-drafts', async (request, reply) => {
    const { id } = parseRequest(idParamsSchema, request.params);
    const { limit } = parseRequest(listQuerySchema, request.query);
    const drafts = await listCompanyOutreachDrafts(id, limit);
    return reply.send(z.array(draftResponseSchema).parse(drafts.map(serializeDraft)));
  });

  server.get('/outreach-drafts/:id', async (request, reply) => {
    const { id } = parseRequest(idParamsSchema, request.params);
    return reply.send(serializeDraft(await getOutreachDraft(id)));
  });

  server.post('/outreach-drafts/:id/revisions', async (request, reply) => {
    const { id } = parseRequest(idParamsSchema, request.params);
    const input = parseRequest(reviseDraftSchema, request.body);
    return reply
      .status(201)
      .send(serializeDraft(await reviseOutreachDraft({ draftId: id, ...input })));
  });

  server.post('/outreach-drafts/:id/submit-review', async (request, reply) => {
    const { id } = parseRequest(idParamsSchema, request.params);
    const input = parseRequest(submitDraftSchema, request.body);
    return reply.send(
      serializeDraft(await submitOutreachDraftForReview({ draftId: id, ...input }))
    );
  });

  server.post('/outreach-drafts/:id/decisions', async (request, reply) => {
    const { id } = parseRequest(idParamsSchema, request.params);
    const input = parseRequest(decideDraftSchema, request.body);
    return reply
      .status(201)
      .send(serializeDraft(await decideOutreachDraft({ draftId: id, ...input })));
  });

  server.post('/outreach-drafts/:id/expire', async (request, reply) => {
    const { id } = parseRequest(idParamsSchema, request.params);
    const input = parseRequest(expireDraftSchema, request.body);
    return reply.send(serializeDraft(await expireOutreachDraft({ draftId: id, ...input })));
  });
};

export default outreachDraftRoutes;
