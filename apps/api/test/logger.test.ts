import { describe, expect, it } from 'vitest';
import { buildLogger, genReqId } from '../src/plugins/logger';
import { buildServer } from '../src/index';

describe('buildLogger', () => {
  it('uses the provided level', () => {
    expect(buildLogger('debug').level).toBe('debug');
  });

  it('falls back to info when no level is provided', () => {
    const previous = process.env.LOG_LEVEL;
    delete process.env.LOG_LEVEL;
    try {
      expect(buildLogger().level).toBe('info');
    } finally {
      if (previous !== undefined) process.env.LOG_LEVEL = previous;
    }
  });

  it('redacts sensitive headers', () => {
    const options = buildLogger('info');
    const redact = options.redact as { paths: string[]; censor: string };
    expect(redact.censor).toBe('[REDACTED]');
    expect(redact.paths).toContain('req.headers.authorization');
    expect(redact.paths).toContain('req.headers.cookie');
  });
});

describe('request correlation id', () => {
  it('honors an incoming x-request-id header', async () => {
    const { server } = buildServer();
    const res = await server.inject({
      method: 'GET',
      url: '/api/health',
      headers: { 'x-request-id': 'trace-abc-123' }
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['x-request-id']).toBe('trace-abc-123');
    await server.close();
  });

  it('generates a request id when none is provided', async () => {
    const { server } = buildServer();
    const res = await server.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['x-request-id']).toBeTruthy();
    await server.close();
  });

  it('genReqId returns a UUID for requests without the header', () => {
    const id = genReqId({ headers: {} } as Parameters<typeof genReqId>[0]);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});
