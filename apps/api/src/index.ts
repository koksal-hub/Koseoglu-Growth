// Load the repository-root .env before any module reads process.env (dev/start only;
// skipped under test runners - see env-loader.ts).
import './env-loader';
import Fastify, { FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { buildLogger, genReqId } from './plugins/logger';
import { Env, validateEnv } from './plugins/env';
import { resolveExposurePolicy, type ExposureEvidence } from './plugins/exposure-policy';
import { registerErrorHandler } from './plugins/errorHandler';
import { createInternalAuthHook } from './plugins/internal-auth';
import { capacityReport, disconnectDatabase } from './lib/prisma';
import { drainReadinessPool } from './lib/db-pools';
import healthRoutes from './routes/health';
import researchMissionRoutes from './routes/research-missions';
import contactPointRoutes from './routes/contact-points';
import rankingRoutes from './routes/ranking';
import outreachDraftRoutes from './routes/outreach-drafts';
import resendWebhookRoutes from './routes/resend-webhooks';
import reportingRoutes from './routes/reporting';
import socialContentRoutes from './routes/social-content';
import socialInboxRoutes from './routes/social-inbox';
import visibilityAssetRoutes from './routes/visibility-assets';
import recommendationMeasurementRoutes from './routes/recommendation-measurement';
import customerLifecycleRoutes from './routes/customer-lifecycle';
import dashboardRoutes from './routes/dashboard';
import companyIntelligenceRoutes from './routes/company-intelligence';

export function buildServer(): { server: FastifyInstance; env: Env; exposure: ExposureEvidence } {
  // validate env on startup
  const env = validateEnv(process.env);
  // Exposure contract: a non-loopback bind needs explicit permission, and a
  // trusted-proxy allowlist is the only thing that may make X-Forwarded-* count
  // as client identity. Both decisions fail closed here, before a socket opens.
  const exposure = resolveExposurePolicy(env);

  const server: FastifyInstance = Fastify({
    logger: buildLogger(env.LOG_LEVEL),
    genReqId,
    disableRequestLogging: false,
    trustProxy: exposure.trustProxy,
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
  const internalAuthHook = createInternalAuthHook(env);
  server.addHook('onRequest', async (request) => {
    const route = request.url.split('?')[0];
    if (route === '/api/health' || route === '/api/ready' || route === '/api/webhooks/resend') return;
    await internalAuthHook(request);
  });

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
  server.register(reportingRoutes, { prefix: '/api' });
  server.register(socialContentRoutes, { prefix: '/api' });
  server.register(socialInboxRoutes, { prefix: '/api' });
  server.register(visibilityAssetRoutes, { prefix: '/api' });
  server.register(recommendationMeasurementRoutes, { prefix: '/api' });
  server.register(customerLifecycleRoutes, { prefix: '/api' });
  server.register(dashboardRoutes, { prefix: '/api' });
  server.register(companyIntelligenceRoutes, { prefix: '/api' });

  // basic swagger/OpenAPI could be added here in the future

  return { server, env, exposure: exposure.evidence };
}

if (require.main === module) {
  const { server, exposure } = buildServer();

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    server.log.info({ signal }, 'Shutting down: closing server and database connections');
    try {
      // Order matters: stop accepting HTTP first, then drain the Prisma business
      // pool, then the dedicated readiness pool. Both drains are idempotent.
      await server.close();
      await disconnectDatabase();
      await drainReadinessPool();
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
    .listen({ port: exposure.port, host: exposure.host })
    .then(() => {
      // Startup evidence: where we listen, whether forwarded headers are
      // trusted at all, and the connection budget verdict. No secrets, no CIDR
      // list (only its size), no live production capacity claim.
      server.log.info({ ...exposure, database: capacityReport }, 'API server listening');
    })
    .catch((err) => {
      // startup errors should be visible
      console.error('Failed to start server', err);
      process.exit(1);
    });
}
