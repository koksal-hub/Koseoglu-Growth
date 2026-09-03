import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { DashboardPolicyError, getDailyDashboard, MAX_DASHBOARD_LIMIT } from '../lib/dashboard';

const querySchema = z
  .object({
    date: z.string().trim().optional(),
    limit: z.coerce.number().int().min(1).max(MAX_DASHBOARD_LIMIT).default(20),
  })
  .strict();

function parseQuery(value: unknown) {
  const result = querySchema.safeParse(value);
  if (!result.success) {
    throw new DashboardPolicyError(400, `Invalid request: ${result.error.issues.map((issue) => issue.message).join(', ')}`);
  }
  return result.data;
}

const dashboardRoutes: FastifyPluginAsync = async (server) => {
  server.get('/dashboard/daily', async (request, reply) => {
    const query = parseQuery(request.query);
    return reply.send(await getDailyDashboard({ reportDate: query.date, limit: query.limit }));
  });
};

export default dashboardRoutes;

