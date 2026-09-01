import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  approveMasterContent,
  approveSocialVariant,
  createMasterContent,
  createSocialVariant,
  getSocialDeliveryStatus,
  listMasterContent,
  listSocialConnections,
  evaluateSocialPublishReadiness,
  recordSocialAttribution,
  scheduleSocialVariant,
  SocialContentPolicyError,
  submitMasterForReview,
  submitVariantForReview,
  transitionSocialConnection,
  createSocialConnection,
} from '../lib/social-content';

const platformSchema = z.enum([
  'LINKEDIN',
  'INSTAGRAM',
  'FACEBOOK',
  'X',
  'THREADS',
  'TIKTOK',
  'YOUTUBE',
  'GOOGLE_BUSINESS',
  'PINTEREST',
]);
const actorSchema = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/);
const idParamsSchema = z.object({ id: z.string().trim().min(1).max(64) }).strict();
const createMasterSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(20_000),
    campaignKey: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/).optional(),
    author: actorSchema,
  })
  .strict();
const createVariantSchema = z
  .object({
    platform: platformSchema,
    body: z.string().trim().min(1).max(20_000),
    mediaManifest: z.unknown().optional(),
    author: actorSchema,
    idempotencyKey: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/),
  })
  .strict();
const reviewerSchema = z.object({ reviewedBy: actorSchema }).strict();
const scheduleSchema = z.object({ scheduledAt: z.coerce.date() }).strict();
const listQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) }).strict();
const connectionStatusSchema = z.object({ status: z.enum(['DISCONNECTED', 'CONNECTED', 'REAUTH_REQUIRED', 'REVOKED']) }).strict();
const createConnectionSchema = z
  .object({
    platform: platformSchema,
    accountKey: actorSchema,
    accountLabel: z.string().trim().min(1).max(200).optional(),
    secretManagerRef: z.string().trim().min(1).max(200).optional(),
    scopes: z.unknown().optional(),
  })
  .strict();
const attributionSchema = z
  .object({
    destinationUrl: z.string().trim().min(1).max(2_000),
    utmSource: z.string().trim().min(1).max(128),
    utmMedium: z.string().trim().min(1).max(128),
    utmCampaign: z.string().trim().min(1).max(128),
    utmContent: z.string().trim().min(1).max(128).optional(),
  })
  .strict();

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new SocialContentPolicyError(400, `Invalid request: ${result.error.issues.map((issue) => issue.message).join(', ')}`);
  }
  return result.data;
}

const socialContentRoutes: FastifyPluginAsync = async (server) => {
  server.post('/social/master-content', async (request, reply) => {
    const content = await createMasterContent(parse(createMasterSchema, request.body));
    return reply.status(201).send(content);
  });

  server.get('/social/master-content', async (request) => {
    const query = parse(listQuerySchema, request.query);
    return listMasterContent(query.limit);
  });

  server.post('/social/connections', async (request, reply) => {
    const connection = await createSocialConnection(parse(createConnectionSchema, request.body));
    return reply.status(201).send(connection);
  });

  server.get('/social/connections', async (request) => {
    const query = parse(listQuerySchema, request.query);
    return listSocialConnections(query.limit);
  });

  server.post('/social/connections/:id/status', async (request) => {
    const { id } = parse(idParamsSchema, request.params);
    const { status } = parse(connectionStatusSchema, request.body);
    return transitionSocialConnection(id, status);
  });

  server.post('/social/master-content/:id/submit-review', async (request) => {
    const { id } = parse(idParamsSchema, request.params);
    return submitMasterForReview(id);
  });

  server.post('/social/master-content/:id/approve', async (request) => {
    const { id } = parse(idParamsSchema, request.params);
    const { reviewedBy } = parse(reviewerSchema, request.body);
    return approveMasterContent(id, reviewedBy);
  });

  server.post('/social/master-content/:id/variants', async (request, reply) => {
    const { id } = parse(idParamsSchema, request.params);
    const input = parse(createVariantSchema, request.body);
    const variant = await createSocialVariant({ masterContentId: id, ...input });
    return reply.status(201).send(variant);
  });

  server.post('/social/variants/:id/submit-review', async (request) => {
    const { id } = parse(idParamsSchema, request.params);
    return submitVariantForReview(id);
  });

  server.post('/social/variants/:id/approve', async (request) => {
    const { id } = parse(idParamsSchema, request.params);
    const { reviewedBy } = parse(reviewerSchema, request.body);
    return approveSocialVariant(id, reviewedBy);
  });

  server.post('/social/variants/:id/schedule', async (request) => {
    const { id } = parse(idParamsSchema, request.params);
    const { scheduledAt } = parse(scheduleSchema, request.body);
    return scheduleSocialVariant(id, scheduledAt);
  });

  server.get('/social/variants/:id/publish-readiness', async (request) => {
    const { id } = parse(idParamsSchema, request.params);
    return evaluateSocialPublishReadiness(id);
  });

  server.get('/social/variants/:id/delivery', async (request) => {
    const { id } = parse(idParamsSchema, request.params);
    return getSocialDeliveryStatus(id);
  });

  server.post('/social/variants/:id/attribution', async (request, reply) => {
    const { id } = parse(idParamsSchema, request.params);
    const result = await recordSocialAttribution({ variantId: id, ...parse(attributionSchema, request.body) });
    return reply.status(result.reused ? 200 : 201).send(result);
  });
};

export default socialContentRoutes;
