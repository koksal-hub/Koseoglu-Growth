import crypto from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import type { Env } from './env';

export class InternalAuthError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message);
    this.name = 'InternalAuthError';
  }
}

function matchesSecret(candidate: string, expected: string) {
  const candidateBytes = Buffer.from(candidate);
  const expectedBytes = Buffer.from(expected);
  return candidateBytes.length === expectedBytes.length && crypto.timingSafeEqual(candidateBytes, expectedBytes);
}

/**
 * Require the internal API key when configured. Development/test without a
 * key stays local-compatible; production startup rejects a missing key in env.ts.
 */
export function createInternalAuthHook(env: Pick<Env, 'NODE_ENV' | 'GROWTH_INTERNAL_API_KEY'>) {
  return async (request: FastifyRequest) => {
    const expected = env.GROWTH_INTERNAL_API_KEY;
    if (!expected) return;
    if (request.method === 'OPTIONS') return;
    const supplied = request.headers['x-api-key'];
    if (typeof supplied !== 'string' || supplied.length === 0) {
      throw new InternalAuthError(401, 'Internal API authentication required');
    }
    if (!matchesSecret(supplied, expected)) {
      throw new InternalAuthError(403, 'Invalid internal API credentials');
    }
  };
}
