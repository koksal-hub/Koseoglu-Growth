import { afterEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { buildLogger } from '../src/plugins/logger';

// PR-D1 (SYS-1/SYS-2): these tests exercise the real server the process runs
// (buildServer -> Fastify constructor with the policy trustProxy value, helmet,
// CORS, the global rate limit and the internal-auth hook), plus one isolated
// server for the rate-limit bucket question. `/api/health` is deliberately
// DB-free (liveness only), so no database is required here.

const ORIGINAL_ENV = { ...process.env };

function setEnv(overrides: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

async function buildRealServer(): Promise<{
  server: FastifyInstance;
  ip: () => string | undefined;
  close: () => Promise<void>;
}> {
  const { buildServer } = await import('../src/index');
  const { server } = buildServer();
  let observedIp: string | undefined;
  server.addHook('onRequest', async (request) => {
    observedIp = request.ip;
  });
  return {
    server,
    ip: () => observedIp,
    close: async () => {
      await server.close();
    }
  };
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

describe('PR-D1 forwarded header handling on the real server', () => {
  it('ignores X-Forwarded-For completely when no proxy is trusted', async () => {
    setEnv({ NODE_ENV: 'test', TRUST_PROXY_CIDRS: undefined, HOST: undefined });
    const real = await buildRealServer();
    try {
      const response = await real.server.inject({
        method: 'GET',
        url: '/api/health',
        headers: { 'x-forwarded-for': '203.0.113.9' },
        remoteAddress: '198.51.100.7'
      });
      expect(response.statusCode).toBe(200);
      expect(real.ip()).toBe('198.51.100.7');
      expect(real.ip()).not.toBe('203.0.113.9');
    } finally {
      await real.close();
    }
  });

  it('lets a proxy outside the allowlist spoof nothing', async () => {
    setEnv({ NODE_ENV: 'test', TRUST_PROXY_CIDRS: '10.0.0.0/8', HOST: undefined });
    const real = await buildRealServer();
    try {
      const response = await real.server.inject({
        method: 'GET',
        url: '/api/health',
        headers: { 'x-forwarded-for': '203.0.113.9, 10.1.2.3' },
        remoteAddress: '192.0.2.50'
      });
      expect(response.statusCode).toBe(200);
      // 192.0.2.50 is not covered by the allowlist, so the chain is not trusted.
      expect(real.ip()).toBe('192.0.2.50');
    } finally {
      await real.close();
    }
  });

  it('resolves the client address when the request really comes from a trusted proxy', async () => {
    setEnv({ NODE_ENV: 'test', TRUST_PROXY_CIDRS: '127.0.0.1/32', HOST: undefined });
    const real = await buildRealServer();
    try {
      const response = await real.server.inject({
        method: 'GET',
        url: '/api/health',
        headers: { 'x-forwarded-for': '203.0.113.9' },
        remoteAddress: '127.0.0.1'
      });
      expect(response.statusCode).toBe(200);
      expect(real.ip()).toBe('203.0.113.9');
    } finally {
      await real.close();
    }
  });

  it('walks a chained header and stops at the first untrusted address', async () => {
    setEnv({ NODE_ENV: 'test', TRUST_PROXY_CIDRS: '127.0.0.1/32,10.0.0.0/8', HOST: undefined });
    const real = await buildRealServer();
    try {
      const response = await real.server.inject({
        method: 'GET',
        url: '/api/health',
        headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.4' },
        remoteAddress: '127.0.0.1'
      });
      expect(response.statusCode).toBe(200);
      // 127.0.0.1 and 10.0.0.4 are trusted proxies; 203.0.113.9 is the client.
      expect(real.ip()).toBe('203.0.113.9');
    } finally {
      await real.close();
    }
  });

  it('keeps the liveness route, request id and redaction policy intact', async () => {
    setEnv({ NODE_ENV: 'test', TRUST_PROXY_CIDRS: undefined, HOST: undefined, GROWTH_INTERNAL_API_KEY: undefined });
    const real = await buildRealServer();
    try {
      const health = await real.server.inject({ method: 'GET', url: '/api/health' });
      expect(health.statusCode).toBe(200);
      expect(JSON.parse(health.payload)).toEqual({ status: 'ok' });

      const traced = await real.server.inject({
        method: 'GET',
        url: '/api/health',
        headers: { 'x-request-id': 'trace-pr-d1' }
      });
      expect(traced.headers['x-request-id']).toBe('trace-pr-d1');

      const unsafe = await real.server.inject({
        method: 'GET',
        url: '/api/health',
        headers: { 'x-request-id': 'unsafe id!' }
      });
      expect(unsafe.headers['x-request-id']).not.toBe('unsafe id!');

      const redaction = buildLogger('info') as { redact?: { paths?: string[] } };
      expect(redaction.redact?.paths).toContain('req.headers.authorization');
      expect(redaction.redact?.paths).toContain("req.headers['x-api-key']");
    } finally {
      await real.close();
    }
  });

  it('keeps the internal auth boundary on business routes', async () => {
    const key = 'B'.repeat(40);
    setEnv({ NODE_ENV: 'test', GROWTH_INTERNAL_API_KEY: key, TRUST_PROXY_CIDRS: undefined, HOST: undefined });
    const real = await buildRealServer();
    try {
      const unauthenticated = await real.server.inject({ method: 'GET', url: '/api/research-missions' });
      expect(unauthenticated.statusCode).toBe(401);

      const wrongKey = await real.server.inject({
        method: 'GET',
        url: '/api/research-missions',
        headers: { 'x-api-key': 'wrong' }
      });
      expect(wrongKey.statusCode).toBe(403);

      // Liveness stays exempt so orchestrators keep working.
      const health = await real.server.inject({ method: 'GET', url: '/api/health' });
      expect(health.statusCode).toBe(200);
    } finally {
      await real.close();
    }
  });
});

describe('PR-D1 rate limit buckets follow the trusted proxy policy', () => {
  async function rateLimitedServer(trustProxy: false | string[]): Promise<FastifyInstance> {
    const server = Fastify({ trustProxy });
    await server.register(rateLimit, { max: 2, timeWindow: '1 minute' });
    server.get('/ping', async () => ({ ok: true }));
    return server;
  }

  it('cannot be bypassed by rotating X-Forwarded-For when no proxy is trusted', async () => {
    const server = await rateLimitedServer(false);
    try {
      const observed: string[] = [];
      for (const forwarded of ['203.0.113.1', '203.0.113.2', '203.0.113.3']) {
        const response = await server.inject({
          method: 'GET',
          url: '/ping',
          headers: { 'x-forwarded-for': forwarded },
          remoteAddress: '198.51.100.9'
        });
        observed.push(
          `${response.statusCode} rem=${response.headers['x-ratelimit-remaining']}`
        );
      }
      // One real client (the socket address) keeps one bucket: a forged header
      // does not create new identities, and the second allowed hit already
      // reports rem=0 before the limit rejects the third.
      expect(observed).toEqual(['200 rem=1', '200 rem=0', '429 rem=0']);
    } finally {
      await server.close();
    }
  });

  it('separates clients by their forwarded address when the proxy is trusted', async () => {
    const server = await rateLimitedServer(['127.0.0.1/32']);
    try {
      const observed: string[] = [];
      for (const forwarded of ['203.0.113.1', '203.0.113.2', '203.0.113.1', '203.0.113.1']) {
        const response = await server.inject({
          method: 'GET',
          url: '/ping',
          headers: { 'x-forwarded-for': forwarded },
          remoteAddress: '127.0.0.1'
        });
        observed.push(
          `${forwarded}:${response.statusCode} rem=${response.headers['x-ratelimit-remaining']}`
        );
      }
      // The forwarded address is the client identity (the allowlist trusts the
      // proxy), so a second client gets its own bucket and the limit applies to
      // the forwarded address itself.
      expect(observed).toEqual([
        '203.0.113.1:200 rem=1',
        '203.0.113.2:200 rem=1',
        '203.0.113.1:200 rem=0',
        '203.0.113.1:429 rem=0'
      ]);
    } finally {
      await server.close();
    }
  });
});