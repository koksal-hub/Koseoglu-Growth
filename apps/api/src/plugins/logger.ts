import { FastifyLoggerOptions } from 'fastify';

export function buildLogger(level?: string): FastifyLoggerOptions {
  return { level: level || process.env.LOG_LEVEL || 'info' };
}
