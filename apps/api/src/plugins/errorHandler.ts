import { FastifyInstance, FastifyError } from 'fastify';

const MIN_VALID_HTTP_STATUS = 400;
const MAX_VALID_HTTP_STATUS = 599;

function isSafeErrorStatusCode(value: number): boolean {
  return Number.isInteger(value) && value >= MIN_VALID_HTTP_STATUS && value <= MAX_VALID_HTTP_STATUS;
}

export function registerErrorHandler(fastify: FastifyInstance) {
  fastify.setErrorHandler((error: FastifyError, request, reply) => {
    // Use fastify structured logger
    fastify.log.error({ err: error }, 'Unhandled error');

    // Never trust an arbitrary error property: only map well-formed 4xx/5xx
    // status codes onto the response. Anything else (missing, out of range or
    // non-numeric) stays 500 so library internals cannot dictate the status line.
    const rawStatus = (error as { statusCode?: unknown }).statusCode;
    const status = typeof rawStatus === 'number' && isSafeErrorStatusCode(rawStatus) ? rawStatus : 500;

    const body = {
      error: {
        message: status === 500 ? 'Internal server error' : (error.message || 'Error')
      }
    };

    reply.status(status).send(body);
  });
}