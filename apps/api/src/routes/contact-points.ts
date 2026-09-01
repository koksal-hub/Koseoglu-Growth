import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  ContactPolicyError,
  createContactPoint,
  evaluateCommunicationGate,
  getContactPoint,
  listCompanyContactPoints,
  recordCommunicationPermission,
  verifyContactPoint
} from '../lib/contact-points';

const shortText = z.string().trim().min(1).max(200);
const actorText = z.string().trim().min(1).max(120);
const countryCode = z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/);
const sensitiveUrlParameter = /^(?:access_token|api_?key|auth|key|password|secret|sig|signature|token)$/i;
const safeHttpUrl = z
  .string()
  .trim()
  .url()
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        ['http:', 'https:'].includes(url.protocol) &&
        !url.username &&
        !url.password &&
        !Array.from(url.searchParams.keys()).some((key) => sensitiveUrlParameter.test(key))
      );
    } catch {
      return false;
    }
  }, 'Only credential-free HTTP(S) URLs without secret query parameters are allowed');

const contactPointType = z.enum(['EMAIL', 'PHONE']);
const contactClassification = z.enum(['COMPANY_GENERAL', 'PERSON_WORK', 'PERSONAL', 'UNKNOWN']);
const noticeStatus = z.enum(['NOT_REQUIRED', 'PENDING', 'PROVIDED', 'EXEMPTION_RECORDED']);
const dataProcessingBasis = z.enum([
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
]);
const communicationChannel = z.enum(['EMAIL', 'PHONE', 'SMS', 'WHATSAPP']);
const communicationPurpose = z.enum(['SALES_OUTREACH', 'MARKETING', 'CUSTOMER_SERVICE']);
const permissionStatus = z.enum(['ALLOWED', 'DENIED', 'OPTED_OUT', 'SUPPRESSED']);
const communicationRule = z.enum([
  'EXPLICIT_CONSENT',
  'EXISTING_CUSTOMER',
  'B2B_RECIPIENT_EXCEPTION',
  'SOFT_OPT_IN',
  'OTHER_REVIEWED',
  'UNKNOWN'
]);
const recipientCategory = z.enum(['LEGAL_ENTITY', 'TRADER_OR_CRAFTSMAN', 'CONSUMER', 'UNKNOWN']);

const idParamsSchema = z.object({ id: z.string().trim().min(1).max(64) }).strict();

const createContactPointSchema = z
  .object({
    contactId: z.string().trim().min(1).max(64).optional(),
    type: contactPointType,
    classification: contactClassification,
    value: z.string().trim().min(1).max(320),
    countryCode,
    sourceUrl: safeHttpUrl,
    sourceName: shortText.optional(),
    sourceIsPublic: z.boolean(),
    collectedAt: z.coerce.date(),
    observedAt: z.coerce.date().optional(),
    confidence: z.number().min(0).max(1),
    collectionPurpose: z.string().trim().min(1).max(500),
    dataProcessingBasis,
    noticeStatus,
    noticeProvidedAt: z.coerce.date().optional(),
    retentionUntil: z.coerce.date().optional(),
    actor: actorText
  })
  .strict()
  .superRefine((value, context) => {
    const allowedClockSkewMs = 5 * 60 * 1000;
    if (value.collectedAt.getTime() > Date.now() + allowedClockSkewMs) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['collectedAt'], message: 'collectedAt cannot be in the future' });
    }
    if (value.observedAt && value.observedAt > value.collectedAt) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['observedAt'], message: 'observedAt cannot be later than collectedAt' });
    }
    if (value.retentionUntil && value.retentionUntil <= value.collectedAt) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['retentionUntil'], message: 'retentionUntil must be later than collectedAt' });
    }
    if (value.classification === 'COMPANY_GENERAL' && value.contactId) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['contactId'], message: 'company-general data cannot reference a person' });
    }
    if (['PERSON_WORK', 'PERSONAL'].includes(value.classification) && !value.contactId) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['contactId'], message: 'person-linked data requires contactId' });
    }
    if (value.classification !== 'COMPANY_GENERAL' && !value.retentionUntil) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['retentionUntil'], message: 'personal or unknown data requires retentionUntil' });
    }
    if (value.noticeStatus === 'PROVIDED' && !value.noticeProvidedAt) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['noticeProvidedAt'], message: 'provided notice requires noticeProvidedAt' });
    }
  });

const verifyContactPointSchema = z
  .object({
    status: z.enum(['VERIFIED', 'INVALID', 'STALE']),
    confidence: z.number().min(0).max(1),
    reason: z.string().trim().min(1).max(1000),
    verifiedBy: actorText,
    verifiedAt: z.coerce.date().optional()
  })
  .strict()
  .superRefine((value, context) => {
    if (value.verifiedAt && value.verifiedAt.getTime() > Date.now() + 5 * 60 * 1000) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['verifiedAt'], message: 'verifiedAt cannot be in the future' });
    }
  });

const recordPermissionSchema = z
  .object({
    channel: communicationChannel,
    purpose: communicationPurpose,
    jurisdictionCountry: countryCode,
    status: permissionStatus,
    dataProcessingBasis,
    communicationRule,
    recipientCategory,
    consentReference: z.string().trim().min(1).max(300).optional(),
    evidenceUrl: safeHttpUrl.optional(),
    policyVersion: z.string().trim().min(1).max(100),
    checkedAt: z.coerce.date(),
    expiresAt: z.coerce.date().optional(),
    reviewedBy: actorText,
    reason: z.string().trim().min(1).max(1000)
  })
  .strict()
  .superRefine((value, context) => {
    if (value.checkedAt.getTime() > Date.now() + 5 * 60 * 1000) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['checkedAt'], message: 'checkedAt cannot be in the future' });
    }
    if (value.expiresAt && value.expiresAt <= value.checkedAt) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['expiresAt'], message: 'expiresAt must be later than checkedAt' });
    }
    if (
      value.status === 'ALLOWED' &&
      (value.dataProcessingBasis === 'UNKNOWN' || value.communicationRule === 'UNKNOWN' || !value.evidenceUrl)
    ) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['status'], message: 'ALLOWED requires basis, rule, and evidenceUrl' });
    }
    if (value.communicationRule === 'EXPLICIT_CONSENT' && !value.consentReference) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['consentReference'], message: 'explicit consent requires consentReference' });
    }
    if (value.status !== 'DENIED' && !value.evidenceUrl) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['evidenceUrl'], message: 'this decision requires evidenceUrl' });
    }
    if (value.communicationRule === 'B2B_RECIPIENT_EXCEPTION' && value.recipientCategory !== 'TRADER_OR_CRAFTSMAN') {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['recipientCategory'], message: 'B2B exception requires trader-or-craftsman category' });
    }
    if (value.communicationRule === 'B2B_RECIPIENT_EXCEPTION' && value.jurisdictionCountry !== 'TR') {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['jurisdictionCountry'], message: 'B2B exception is restricted to TR' });
    }
  });

const gateQuerySchema = z
  .object({
    channel: communicationChannel,
    purpose: communicationPurpose,
    jurisdictionCountry: countryCode
  })
  .strict();

const permissionResponseSchema = z.object({
  id: z.string(),
  contactPointId: z.string(),
  channel: communicationChannel,
  purpose: communicationPurpose,
  jurisdictionCountry: z.string(),
  status: permissionStatus,
  dataProcessingBasis,
  communicationRule,
  recipientCategory,
  consentReference: z.string().nullable(),
  evidenceUrl: z.string().nullable(),
  policyVersion: z.string(),
  checkedAt: z.string(),
  expiresAt: z.string().nullable(),
  reviewedBy: z.string(),
  reason: z.string(),
  createdAt: z.string()
});

const contactPointResponseSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  contactId: z.string().nullable(),
  type: contactPointType,
  classification: contactClassification,
  normalizedValue: z.string(),
  countryCode: z.string(),
  sourceUrl: z.string(),
  sourceName: z.string().nullable(),
  sourceIsPublic: z.boolean(),
  collectedAt: z.string(),
  observedAt: z.string().nullable(),
  verificationStatus: z.enum(['UNVERIFIED', 'VERIFIED', 'INVALID', 'STALE']),
  verifiedAt: z.string().nullable(),
  verifiedBy: z.string().nullable(),
  verificationReason: z.string().nullable(),
  confidence: z.number(),
  collectionPurpose: z.string(),
  dataProcessingBasis,
  noticeStatus,
  noticeProvidedAt: z.string().nullable(),
  retentionUntil: z.string().nullable(),
  deletedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  permissions: z.array(permissionResponseSchema)
});

function parseRequest<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
    throw new ContactPolicyError(400, `Invalid request: ${path}${issue.message}`);
  }
  return result.data;
}

type PermissionRecord = Awaited<ReturnType<typeof recordCommunicationPermission>>;
type ContactPointRecord = Awaited<ReturnType<typeof getContactPoint>>;

function serializePermission(permission: PermissionRecord | ContactPointRecord['permissions'][number]) {
  return permissionResponseSchema.parse({
    ...permission,
    checkedAt: permission.checkedAt.toISOString(),
    expiresAt: permission.expiresAt?.toISOString() ?? null,
    createdAt: permission.createdAt.toISOString()
  });
}

function serializeContactPoint(contactPoint: ContactPointRecord) {
  return contactPointResponseSchema.parse({
    ...contactPoint,
    collectedAt: contactPoint.collectedAt.toISOString(),
    observedAt: contactPoint.observedAt?.toISOString() ?? null,
    verifiedAt: contactPoint.verifiedAt?.toISOString() ?? null,
    noticeProvidedAt: contactPoint.noticeProvidedAt?.toISOString() ?? null,
    retentionUntil: contactPoint.retentionUntil?.toISOString() ?? null,
    deletedAt: contactPoint.deletedAt?.toISOString() ?? null,
    createdAt: contactPoint.createdAt.toISOString(),
    updatedAt: contactPoint.updatedAt.toISOString(),
    permissions: contactPoint.permissions.map(serializePermission)
  });
}

const contactPointRoutes: FastifyPluginAsync = async (server) => {
  server.post('/companies/:id/contact-points', async (request, reply) => {
    const { id } = parseRequest(idParamsSchema, request.params);
    const input = parseRequest(createContactPointSchema, request.body);
    const contactPoint = await createContactPoint({ companyId: id, ...input });
    return reply.status(201).send(serializeContactPoint(contactPoint));
  });

  server.get('/companies/:id/contact-points', async (request, reply) => {
    const { id } = parseRequest(idParamsSchema, request.params);
    const contactPoints = await listCompanyContactPoints(id);
    return reply.send(z.array(contactPointResponseSchema).parse(contactPoints.map(serializeContactPoint)));
  });

  server.post('/contact-points/:id/verification', async (request, reply) => {
    const { id } = parseRequest(idParamsSchema, request.params);
    const input = parseRequest(verifyContactPointSchema, request.body);
    const contactPoint = await verifyContactPoint({ contactPointId: id, ...input });
    return reply.send(serializeContactPoint(contactPoint));
  });

  server.post('/contact-points/:id/permissions', async (request, reply) => {
    const { id } = parseRequest(idParamsSchema, request.params);
    const input = parseRequest(recordPermissionSchema, request.body);
    const permission = await recordCommunicationPermission({ contactPointId: id, ...input });
    return reply.status(201).send(serializePermission(permission));
  });

  server.get('/contact-points/:id/communication-gate', async (request, reply) => {
    const { id } = parseRequest(idParamsSchema, request.params);
    const query = parseRequest(gateQuerySchema, request.query);
    const result = await evaluateCommunicationGate({ contactPointId: id, ...query });
    return reply.send({ ...result, evaluatedAt: result.evaluatedAt.toISOString() });
  });
};

export default contactPointRoutes;
