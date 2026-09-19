import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  CompanyIntelligencePolicyError,
  getCompanyEvidenceBrief,
  getCompanyIntelligenceTimeline,
  getCompanyIntelligenceInsights,
  MAX_COMPANY_INTELLIGENCE_LIMIT,
} from '../lib/company-intelligence';

const paramsSchema = z
  .object({ id: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/) })
  .strict();
const querySchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    limit: z.coerce.number().int().min(1).max(MAX_COMPANY_INTELLIGENCE_LIMIT).default(50),
  })
  .strict();
const insightQuerySchema = querySchema.extend({ category: z.enum(['COMPANY', 'MARKET', 'SUPPLY_CHAIN']).optional() });

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new CompanyIntelligencePolicyError(400, `Invalid request: ${result.error.issues.map((issue) => issue.message).join(', ')}`);
  }
  return result.data;
}

const companyIntelligenceRoutes: FastifyPluginAsync = async (server) => {
  server.get('/intelligence/companies/:id/timeline', async (request, reply) => {
    const { id } = parse(paramsSchema, request.params);
    const query = parse(querySchema, request.query);
    return reply.send(await getCompanyIntelligenceTimeline({ companyId: id, ...query }));
  });

  server.get('/intelligence/companies/:id/evidence-brief', async (request, reply) => {
    const { id } = parse(paramsSchema, request.params);
    const query = parse(querySchema, request.query);
    return reply.send(await getCompanyEvidenceBrief({ companyId: id, ...query }));
  });

  server.get('/intelligence/companies/:id/insights', async (request, reply) => {
    const { id } = parse(paramsSchema, request.params);
    const query = parse(insightQuerySchema, request.query);
    return reply.send(await getCompanyIntelligenceInsights({ companyId: id, ...query }));
  });
};

export default companyIntelligenceRoutes;
