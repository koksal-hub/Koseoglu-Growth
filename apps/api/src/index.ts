import Fastify, { FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { buildLogger, genReqId } from './plugins/logger';
import { Env, validateEnv } from './plugins/env';
import { registerErrorHandler } from './plugins/errorHandler';
import { prisma } from './lib/prisma';
import healthRoutes from './routes/health';
import researchMissionRoutes from './routes/research-missions';
import contactPointRoutes from './routes/contact-points';
import rankingRoutes from './routes/ranking';
import outreachDraftRoutes from './routes/outreach-drafts';
import resendWebhookRoutes from './routes/resend-webhooks';

export function buildServer(): { server: FastifyInstance; env: Env } {
  // validate env on startup
  const env = validateEnv(process.env);

  const server: FastifyInstance = Fastify({
    logger: buildLogger(env.LOG_LEVEL),
    genReqId,
    disableRequestLogging: false,
  });

  // expose the correlation id to clients so responses can be traced in logs
  server.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  // register central error handler
  registerErrorHandler(server);

  // security plugins
  const corsOrigins = env.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  server.register(helmet);
  // env-based allowlist; with no CORS_ORIGINS configured, cross-origin
  // requests are rejected (same-origin clients are unaffected).
  server.register(cors, { origin: corsOrigins.length > 0 ? corsOrigins : false });
  server.register(rateLimit, { max: 100, timeWindow: '1 minute' });

  // register routes
  server.register(healthRoutes, { prefix: '/api' });
  // Business routes are local/private until the authentication architecture is
  // approved and implemented. They must not be exposed in a public deployment.
  server.register(researchMissionRoutes, { prefix: '/api' });
  server.register(contactPointRoutes, { prefix: '/api' });
  server.register(rankingRoutes, { prefix: '/api' });
  server.register(outreachDraftRoutes, { prefix: '/api' });
  server.register(resendWebhookRoutes, {
    prefix: '/api',
    webhookSecret: env.RESEND_WEBHOOK_SECRET,
  });

  // basic swagger/OpenAPI could be added here in the future

  return { server, env };
}

if (require.main === module) {
  const { server, env } = buildServer();

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    server.log.info({ signal }, 'Shutting down: closing server and database connections');
    try {
      await server.close();
      await prisma.$disconnect();
      process.exit(0);
    } catch (err) {
      server.log.error({ err }, 'Error during graceful shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', (signal) => void shutdown(signal));
  process.on('SIGINT', (signal) => void shutdown(signal));

  process.on('unhandledRejection', (reason) => {
    server.log.fatal({ err: reason }, 'Unhandled promise rejection — exiting');
    process.exit(1);
  });
  process.on('uncaughtException', (err) => {
    server.log.fatal({ err }, 'Uncaught exception — exiting');
    process.exit(1);
  });

  server
    .listen({ port: env.PORT, host: '0.0.0.0' })
    .then(() => {
      server.log.info({ port: env.PORT }, 'API server listening');
    })
    .catch((err) => {
      // startup errors should be visible
      console.error('Failed to start server', err);
      process.exit(1);
    });
}
