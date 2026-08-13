import { FastifyLoggerOptions } from 'fastify';

export function buildLogger(): FastifyLoggerOptions {
  return { level: process.env.LOG_LEVEL || 'info' };
}
