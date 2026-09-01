import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  listCompanyRankingReceipts,
  RankingPolicyError,
  refreshDailyActions,
  RANKING_ALGORITHM_VERSION
} from '../lib/ranking';

const idParamsSchema = z.object({ id: z.string().trim().min(1).max(64) }).strict();
const listQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) }).strict();
const actorText = z.string().trim().min(1).max(120);
const countryCode = z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/);
const channelSchema = z.enum(['EMAIL', 'PHONE', 'SMS', 'WHATSAPP']);
const purposeSchema = z.enum(['SALES_OUTREACH', 'MARKETING', 'CUSTOMER_SERVICE']);
const nextActionSchema = z.enum([
  'VERIFY_COMPANY',
  'COLLECT_EVIDENCE',
  'VERIFY_CONTACT_POINT',
  'REVIEW_COMMUNICATION_PERMISSION',
  'HONOR_SUPPRESSION',
  'READY_FOR_HUMAN_OUTREACH_REVIEW'
]);

const refreshDailyActionsSchema = z
  .object({
    companyIds: z.array(z.string().trim().min(1).max(64)).min(1).max(100),
    targetCountries: z.array(countryCode).min(1).max(20),
    targetSectors: z.array(z.string().trim().min(1).max(120)).min(1).max(20),
    channel: channelSchema,
    purpose: purposeSchema,
    jurisdictionCountry: countryCode,
    policyVersion: z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9._:-]+$/),
    evaluatedAt: z.coerce.date().optional(),
    createdBy: actorText
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.companyIds).size !== value.companyIds.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['companyIds'], message: 'companyIds must be unique' });
    }
    if (value.evaluatedAt && value.evaluatedAt.getTime() > Date.now() + 5 * 60 * 1000) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['evaluatedAt'], message: 'evaluatedAt cannot be in the future' });
    }
  });

const evidenceReceiptSchema = z.object({
  id: z.string(),
  sourceUrl: z.string(),
  claimKey: z.string().nullable(),
  accessedAt: z.string(),
  effectiveAt: z.string(),
  freshnessStatus: z.enum(['CURRENT', 'STALE', 'UNKNOWN']),
  confidence: z.number(),
  qualified: z.boolean(),
  exclusionReasons: z.array(z.string())
});

const contactReceiptSchema = z.object({
  contactPointId: z.string(),
  classification: z.enum(['COMPANY_GENERAL', 'PERSON_WORK', 'PERSONAL', 'UNKNOWN']),
  verificationStatus: z.enum(['UNVERIFIED', 'VERIFIED', 'INVALID', 'STALE']),
  confidence: z.number(),
  sourceUrl: z.string(),
  collectedAt: z.string(),
  observedAt: z.string().nullable(),
  verifiedAt: z.string().nullable(),
  retentionUntil: z.string().nullable(),
  noticeStatus: z.enum(['NOT_REQUIRED', 'PENDING', 'PROVIDED', 'EXEMPTION_RECORDED']),
  dataProcessingBasis: z.enum([
    'CONSENT',
    'CONTRACT',
    'LEGAL_OBLIGATION',
    'LEGITIMATE_INTEREST',
    'PUBLIC_INTEREST',
    'VITAL_INTEREST',
    'PUBLICIZED_BY_DATA_SUBJECT',
    'LEGAL_CLAIM',
    'NOT_PERSONAL_DATA',
    'UNKNOWN'
  ]),
  gateDecision: z.enum(['ALLOW', 'DENY']),
  gateReasons: z.array(z.string()),
  permissionId: z.string().nullable(),
  permissionCheckedAt: z.string().nullable(),
  permissionExpiresAt: z.string().nullable(),
  permissionStatus: z.enum(['ALLOWED', 'DENIED', 'OPTED_OUT', 'SUPPRESSED']).nullable(),
  communicationRule: z
    .enum(['EXPLICIT_CONSENT', 'EXISTING_CUSTOMER', 'B2B_RECIPIENT_EXCEPTION', 'SOFT_OPT_IN', 'OTHER_REVIEWED', 'UNKNOWN'])
    .nullable(),
  actualSendPerformed: z.literal(false)
});

const rankingContextSchema = z.object({
  targetCountries: z.array(z.string()),
  targetSectors: z.array(z.string()),
  channel: channelSchema,
  purpose: purposeSchema,
  jurisdictionCountry: z.string(),
  policyVersion: z.string(),
  evaluatedAt: z.string(),
  maxCurrentEvidenceAgeDays: z.number().int().positive()
});

const rankingReceiptResponseSchema = z.object({
  id: z.string(),
  company: z.object({
    id: z.string(),
    name: z.string(),
    country: z.string().nullable(),
    sector: z.string().nullable(),
    confidence: z.number()
  }),
  algorithmVersion: z.string(),
  policyVersion: z.string(),
  inputHash: z.string().regex(/^[0-9a-f]{64}$/),
  context: rankingContextSchema,
  evidenceReceipt: z.array(evidenceReceiptSchema),
  contactReceipt: z.array(contactReceiptSchema),
  scores: z.object({
    icpFit: z.number().int().min(0).max(20),
    companyConfidence: z.number().int().min(0).max(20),
    evidence: z.number().int().min(0).max(20),
    contact: z.number().int().min(0).max(20),
    permission: z.number().int().min(0).max(20),
    total: z.number().int().min(0).max(100)
  }),
  reasons: z.array(z.string()),
  nextAction: nextActionSchema,
  evaluatedAt: z.string(),
  createdBy: z.string(),
  createdAt: z.string(),
  actualLeadCreated: z.literal(false),
  actualOutreachCreated: z.literal(false),
  actualSendPerformed: z.literal(false)
});

function parseRequest<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
    throw new RankingPolicyError(400, `Invalid request: ${path}${issue.message}`);
  }
  return result.data;
}

type RankingReceipt = Awaited<ReturnType<typeof listCompanyRankingReceipts>>[number];

function serializeRankingReceipt(receipt: RankingReceipt) {
  return rankingReceiptResponseSchema.parse({
    id: receipt.id,
    company: {
      id: receipt.company.id,
      name: receipt.company.name,
      country: receipt.company.country,
      sector: receipt.company.sector,
      confidence: receipt.company.confidence
    },
    algorithmVersion: receipt.algorithmVersion,
    policyVersion: receipt.policyVersion,
    inputHash: receipt.inputHash,
    context: receipt.context,
    evidenceReceipt: receipt.evidenceReceipt,
    contactReceipt: receipt.contactReceipt,
    scores: {
      icpFit: receipt.icpFitScore,
      companyConfidence: receipt.companyConfidenceScore,
      evidence: receipt.evidenceScore,
      contact: receipt.contactScore,
      permission: receipt.permissionScore,
      total: receipt.totalScore
    },
    reasons: receipt.reasonCodes,
    nextAction: receipt.nextAction,
    evaluatedAt: receipt.evaluatedAt.toISOString(),
    createdBy: receipt.createdBy,
    createdAt: receipt.createdAt.toISOString(),
    actualLeadCreated: false,
    actualOutreachCreated: false,
    actualSendPerformed: false
  });
}

const rankingRoutes: FastifyPluginAsync = async (server) => {
  server.post('/daily-actions/refresh', async (request, reply) => {
    const input = parseRequest(refreshDailyActionsSchema, request.body);
    const evaluatedAt = input.evaluatedAt ?? new Date();
    const receipts = await refreshDailyActions({ ...input, evaluatedAt });
    return reply.send({
      algorithmVersion: RANKING_ALGORITHM_VERSION,
      policyVersion: input.policyVersion,
      evaluatedAt: evaluatedAt.toISOString(),
      actions: z.array(rankingReceiptResponseSchema).parse(receipts.map(serializeRankingReceipt)),
      actualLeadCreated: false,
      actualOutreachCreated: false,
      actualSendPerformed: false
    });
  });

  server.get('/companies/:id/ranking-receipts', async (request, reply) => {
    const { id } = parseRequest(idParamsSchema, request.params);
    const { limit } = parseRequest(listQuerySchema, request.query);
    const receipts = await listCompanyRankingReceipts(id, limit);
    return reply.send(z.array(rankingReceiptResponseSchema).parse(receipts.map(serializeRankingReceipt)));
  });
};

export default rankingRoutes;
