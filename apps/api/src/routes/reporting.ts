import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { generateManagementReport, ReportingPolicyError } from '../lib/reporting';

const querySchema = z.object({ date: z.string().trim().optional() }).strict();

const reportingRoutes: FastifyPluginAsync = async (server) => {
  // Internal/private until authentication is implemented. This endpoint only
  // returns aggregate counts and pseudonymous-safe usage totals.
  server.get('/reports/management', async (request, reply) => {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      throw new ReportingPolicyError(400, `Invalid request: ${parsed.error.issues.map((issue) => issue.message).join(', ')}`);
    }
    const result = await generateManagementReport(parsed.data.date);
    return reply.send({
      report: result.report,
      reused: result.reused,
    });
  });
};

export default reportingRoutes;
