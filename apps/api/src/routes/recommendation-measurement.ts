import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  listRecommendationExposures,
  RecommendationMeasurementError,
  recordRecommendationExposure,
  recordRecommendationOutcome
} from '../lib/recommendation-measurement';

const keySchema = z.string().trim().min(1).max(256).regex(/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/);
const hashSchema = z.string().regex(/^[0-9a-f]{64}$/i);
const recommendationTypeSchema = z.enum(['LEAD_RANKING', 'RESEARCH_ACTION']);
const exposureModeSchema = z.enum(['EXPLOITATION', 'EXPLORATION']);
const outcomeTypeSchema = z.enum(['HUMAN_ACTION', 'LEAD_CREATED', 'QUOTE_REQUESTED', 'WON_SHIPMENT', 'GROSS_PROFIT']);
const exposureSchema = z
  .object({
    exposureKey: keySchema,
    recommendationType: recommendationTypeSchema,
    recommendationId: keySchema,
    algorithmVersion: keySchema,
    inputHash: hashSchema,
    mode: exposureModeSchema,
    position: z.number().int().min(1).max(100),
    actor: keySchema,
    exposedAt: z.coerce.date()
  })
  .strict();
const outcomeSchema = z
  .object({
    outcomeKey: keySchema,
    outcomeType: outcomeTypeSchema,
    occurredAt: z.coerce.date(),
    valueMinor: z.number().int().min(0).max(2_000_000_000).optional(),
    currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(),
    sourceRef: keySchema.optional(),
    recordedBy: keySchema
  })
  .strict();
const listSchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    recommendationType: recommendationTypeSchema.optional(),
    recommendationId: keySchema.optional()
  })
  .strict();
const idSchema = z.object({ id: keySchema }).strict();

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new RecommendationMeasurementError(400, `Invalid request: ${result.error.issues.map((issue) => issue.message).join(', ')}`);
  }
  return result.data;
}

const recommendationMeasurementRoutes: FastifyPluginAsync = async (server) => {
  server.post('/recommendation-exposures', async (request, reply) => {
    const result = await recordRecommendationExposure(parse(exposureSchema, request.body));
    return reply.status(result.reused ? 200 : 201).send(result);
  });

  server.get('/recommendation-exposures', async (request) => {
    return listRecommendationExposures(parse(listSchema, request.query));
  });

  server.post('/recommendation-exposures/:id/outcomes', async (request, reply) => {
    const { id } = parse(idSchema, request.params);
    const result = await recordRecommendationOutcome({ exposureId: id, ...parse(outcomeSchema, request.body) });
    return reply.status(result.reused ? 200 : 201).send(result);
  });
};

export default recommendationMeasurementRoutes;
