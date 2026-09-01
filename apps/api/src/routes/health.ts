import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma';

export default async function healthRoutes(fastify: FastifyInstance) {
  // Liveness: the process is up and can serve requests. Deliberately cheap —
  // no DB access — so orchestrators don't restart the API on DB hiccups.
  fastify.get('/health', async () => {
    return { status: 'ok' };
  });

  // Readiness: the service can do useful work, i.e. the database is
  // reachable. Returns 503 when the DB is down so load balancers /
  // orchestrators stop routing traffic here.
  fastify.get('/ready', async (request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: 'ready' };
    } catch (err) {
      request.log.error({ err }, 'readiness check failed: database unreachable');
      return reply.status(503).send({ status: 'unavailable', reason: 'database unreachable' });
    }
  });
}
