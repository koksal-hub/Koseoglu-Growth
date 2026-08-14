import { randomUUID } from 'node:crypto';
import { FastifyLoggerOptions, FastifyRequest } from 'fastify';
import type { PinoLoggerOptions } from 'fastify/types/logger';

/**
 * Sensitive fields that must never appear in logs (central redaction policy).
 */
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  "req.headers['x-api-key']",
  'res.headers["set-cookie"]'
];

export function buildLogger(level?: string): FastifyLoggerOptions & PinoLoggerOptions {
  return {
    level: level || process.env.LOG_LEVEL || 'info',
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' }
  };
}

/**
 * Correlation id for every request: honor an incoming `x-request-id` header
 * (so ids propagate across services), otherwise generate a UUID. The id is
 * attached to every log line via Fastify's per-request logger and echoed
 * back in the `x-request-id` response header.
 */
export function genReqId(req: FastifyRequest['raw']): string {
  const incoming = req.headers['x-request-id'];
  if (typeof incoming === 'string' && incoming.length > 0) {
    return incoming;
  }
  return randomUUID();
}
