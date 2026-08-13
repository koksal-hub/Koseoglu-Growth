import Fastify, { FastifyInstance } from 'fastify';
import { buildLogger } from './plugins/logger';
import { Env, validateEnv } from './plugins/env';
import { registerErrorHandler } from './plugins/errorHandler';
import healthRoutes from './routes/health';

export function buildServer(): { server: FastifyInstance; env: Env } {
  // validate env on startup
  const env = validateEnv(process.env);

  const server: FastifyInstance = Fastify({ logger: buildLogger() });

  // register central error handler
  registerErrorHandler(server);

  // register routes
  server.register(healthRoutes, { prefix: '/api' });

  // basic swagger/OpenAPI could be added here in the future

  return { server, env };
}

if (require.main === module) {
  const { server, env } = buildServer();
  const port = Number(process.env.PORT || env.PORT || 3000);
  server.listen({ port, host: '0.0.0.0' }).then(() => {
    server.log.info({ port }, 'API server listening');
  }).catch((err) => {
    // startup errors should be visible
    console.error('Failed to start server', err);
    process.exit(1);
  });
}
