import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  listRecommendationExposures,
  RecommendationMeasurementError,
  recordRecommendationExposure,
  recordRecommendationOutcome,
  recordRecommendationOutcomeProvenanceReview
} from '../lib/recommendation-measurement';

const keySchema = z.string().trim().min(1).max(256).regex(/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/);
const hashSchema = z.string().regex(/^[0-9a-f]{64}$/i);
const recommendationTypeSchema = z.enum(['LEAD_RANKING', 'RESEARCH_ACTION']);
const exposureModeSchema = z.enum(['EXPLOITATION', 'EXPLORATION']);
const outcomeTypeSchema = z.enum(['HUMAN_ACTION', 'LEAD_CREATED', 'QUOTE_REQUESTED', 'WON_SHIPMENT', 'GROSS_PROFIT']);
const outcomeSourceTypeSchema = z.enum(['CRM_LEAD', 'CRM_OPPORTUNITY', 'CRM_EVENT', 'HUMAN_NOTE', 'OPERATIONS_RECORD']);
const provenanceReviewDecisionSchema = z.enum(['APPROVED', 'REJECTED']);
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
    // Money contract (PR-BC1): GROSS_PROFIT is a signed economic fact (a
    // shipment can lose money), every other outcome value is a magnitude and
    // stays non-negative. The same rule is enforced in
    // recordRecommendationOutcome and by a matching PostgreSQL CHECK, so the
    // three layers cannot drift apart.
    valueMinor: z.number().int().min(-2_000_000_000).max(2_000_000_000).optional(),
    currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(),
    sourceRef: keySchema.optional(),
    sourceType: outcomeSourceTypeSchema.optional(),
    sourceId: keySchema.optional(),
    recordedBy: keySchema
  })
  .strict()
  .superRefine((value, context) => {
    if (value.valueMinor !== undefined && value.valueMinor < 0 && value.outcomeType !== 'GROSS_PROFIT') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['valueMinor'],
        message: 'valueMinor must be non-negative unless the outcome type is GROSS_PROFIT'
      });
    }
  });
const listSchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    recommendationType: recommendationTypeSchema.optional(),
    recommendationId: keySchema.optional()
  })
  .strict();
const idSchema = z.object({ id: keySchema }).strict();
const provenanceReviewSchema = z
  .object({
    reviewKey: keySchema,
    decision: provenanceReviewDecisionSchema,
    reviewedBy: keySchema,
    reason: z.string().trim().min(1).max(1_000)
  })
  .strict();

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

  server.post('/recommendation-outcomes/:id/provenance-review', async (request, reply) => {
    const { id } = parse(idSchema, request.params);
    const result = await recordRecommendationOutcomeProvenanceReview({ outcomeId: id, ...parse(provenanceReviewSchema, request.body) });
    return reply.status(result.reused ? 200 : 201).send(result);
  });
};

export default recommendationMeasurementRoutes;
