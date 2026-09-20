import { FastifyInstance } from 'fastify';
import { checkReadiness, getReadinessPool, READINESS_BUDGET_MS } from '../lib/db-pools';

export default async function healthRoutes(fastify: FastifyInstance) {
  // Liveness: the process is up and can serve requests. Deliberately cheap —
  // no DB access — so orchestrators don't restart the API on DB hiccups.
  fastify.get('/health', async () => {
    return { status: 'ok' };
  });

  // Readiness: the service can do useful work, i.e. the database is reachable.
  // PR-D5 (SYS-3): the check runs on a dedicated read-only pool whose connect
  // (750 ms), statement (1000 ms) and query (1250 ms) timeouts keep the whole
  // answer inside the 2000 ms budget, so a half-accessible database produces a
  // fast 503 instead of an open-ended wait.
  fastify.get('/ready', async (request, reply) => {
    const result = await checkReadiness(getReadinessPool(), READINESS_BUDGET_MS);
    if (result.ok) return { status: 'ready' };
    request.log.error(
      { elapsedMs: result.elapsedMs, budgetMs: READINESS_BUDGET_MS, detail: result.detail },
      'readiness check failed: database unreachable'
    );
    return reply.status(503).send({ status: 'unavailable', reason: result.reason });
  });
}
