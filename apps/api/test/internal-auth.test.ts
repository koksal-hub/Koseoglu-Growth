import { describe, expect, it } from 'vitest';
import type { FastifyRequest } from 'fastify';
import { createInternalAuthHook } from '../src/plugins/internal-auth';
import { validateEnv } from '../src/plugins/env';

const INTERNAL_KEY = 'A'.repeat(40);

function request(method = 'GET', headers: Record<string, string> = {}) {
  return { method, headers } as unknown as FastifyRequest;
}

describe('internal API authentication boundary', () => {
  it('keeps development without a configured key local-compatible', async () => {
    const hook = createInternalAuthHook({ NODE_ENV: 'development', GROWTH_INTERNAL_API_KEY: undefined });
    await expect(hook(request())).resolves.toBeUndefined();
  });

  it('requires and compares x-api-key without accepting missing or wrong values', async () => {
    const hook = createInternalAuthHook({ NODE_ENV: 'production', GROWTH_INTERNAL_API_KEY: INTERNAL_KEY });
    await expect(hook(request())).rejects.toMatchObject({ statusCode: 401 });
    await expect(hook(request('GET', { 'x-api-key': 'wrong-key' }))).rejects.toMatchObject({ statusCode: 403 });
    await expect(hook(request('GET', { 'x-api-key': INTERNAL_KEY }))).resolves.toBeUndefined();
  });

  it('does not block CORS preflight when the key is configured', async () => {
    const hook = createInternalAuthHook({ NODE_ENV: 'production', GROWTH_INTERNAL_API_KEY: INTERNAL_KEY });
    await expect(hook(request('OPTIONS'))).resolves.toBeUndefined();
  });

  it('fails production env validation without the internal key', () => {
    expect(() => validateEnv({ DATABASE_URL: 'postgresql://example.invalid/growth', NODE_ENV: 'production' })).toThrow(
      /Environment validation failed/
    );
    expect(
      validateEnv({ DATABASE_URL: 'postgresql://example.invalid/growth', NODE_ENV: 'production', GROWTH_INTERNAL_API_KEY: INTERNAL_KEY })
    ).toMatchObject({ GROWTH_INTERNAL_API_KEY: INTERNAL_KEY });
  });
});
