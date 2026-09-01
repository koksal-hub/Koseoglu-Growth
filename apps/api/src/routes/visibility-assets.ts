import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  approveVisibilityAsset,
  createVisibilityAsset,
  evaluateVisibilityReadiness,
  listVisibilityAssets,
  submitVisibilityAssetForReview,
  VisibilityPolicyError,
} from '../lib/visibility-assets';

const keySchema = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/);
const idSchema = z.object({ id: keySchema }).strict();
const modeSchema = z.enum(['SEO', 'GEO']);
const localeSchema = z.string().trim().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/);
const createSchema = z
  .object({
    assetKey: keySchema,
    mode: modeSchema,
    locale: localeSchema,
    canonicalUrl: z.string().trim().min(1).max(2_000),
    title: z.string().trim().min(1).max(70),
    description: z.string().trim().min(1).max(320),
    targetIntents: z.array(z.string().trim().min(1).max(120)).min(1).max(10),
    structuredData: z.unknown().optional(),
    robots: z.enum(['INDEX_FOLLOW', 'NOINDEX_NOFOLLOW']).optional(),
    author: keySchema,
  })
  .strict();
const listSchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    mode: modeSchema.optional(),
    status: z.enum(['DRAFT', 'IN_REVIEW', 'APPROVED', 'ARCHIVED']).optional(),
  })
  .strict();
const reviewerSchema = z.object({ reviewedBy: keySchema }).strict();

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new VisibilityPolicyError(400, `Invalid request: ${result.error.issues.map((issue) => issue.message).join(', ')}`);
  }
  return result.data;
}

const visibilityAssetRoutes: FastifyPluginAsync = async (server) => {
  server.post('/visibility/assets', async (request, reply) => {
    const result = await createVisibilityAsset(parse(createSchema, request.body));
    return reply.status(result.reused ? 200 : 201).send(result);
  });

  server.get('/visibility/assets', async (request) => {
    const query = parse(listSchema, request.query);
    return listVisibilityAssets(query);
  });

  server.post('/visibility/assets/:id/submit-review', async (request) => {
    const { id } = parse(idSchema, request.params);
    return submitVisibilityAssetForReview(id);
  });

  server.post('/visibility/assets/:id/approve', async (request) => {
    const { id } = parse(idSchema, request.params);
    const { reviewedBy } = parse(reviewerSchema, request.body);
    return approveVisibilityAsset(id, reviewedBy);
  });

  server.get('/visibility/assets/:id/readiness', async (request) => {
    const { id } = parse(idSchema, request.params);
    return evaluateVisibilityReadiness(id);
  });
};

export default visibilityAssetRoutes;
