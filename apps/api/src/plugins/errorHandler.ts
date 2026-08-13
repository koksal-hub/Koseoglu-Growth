import { FastifyInstance, FastifyError } from 'fastify';

export function registerErrorHandler(fastify: FastifyInstance) {
  fastify.setErrorHandler((error: FastifyError, request, reply) => {
    // Use fastify's structured logger
    fastify.log.error({ err: error }, 'Unhandled error');

    let status = 500;
    const maybeError: unknown = error;

    if (typeof maybeError === 'object' && maybeError !== null && 'statusCode' in (maybeError as Record<string, unknown>)) {
      const sc = (maybeError as Record<string, unknown>)['statusCode'];
      if (typeof sc === 'number') {
        status = sc;
      }
    }

    const body = {
      error: {
        message: status === 500 ? 'Internal server error' : (error.message || 'Error')
      }
    };

    reply.status(status).send(body);
  });
}
