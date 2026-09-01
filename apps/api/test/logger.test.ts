import { Writable } from 'node:stream';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { buildLogger, genReqId } from '../src/plugins/logger';
import { buildServer } from '../src/index';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

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

  it('redacts sensitive request and response headers in serialized output', () => {
    const lines: string[] = [];
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        lines.push(chunk.toString());
        callback();
      }
    });
    const logger = pino(buildLogger('info'), destination);

    logger.info({
      req: {
        headers: {
          authorization: 'Bearer auth-secret',
          cookie: 'session=cookie-secret',
          'x-api-key': 'api-key-secret'
        }
      },
      res: { headers: { 'set-cookie': 'session=set-cookie-secret' } }
    });

    const output = lines.join('');
    const entry = JSON.parse(output) as {
      req: { headers: Record<string, string> };
      res: { headers: Record<string, string> };
    };
    expect(entry.req.headers.authorization).toBe('[REDACTED]');
    expect(entry.req.headers.cookie).toBe('[REDACTED]');
    expect(entry.req.headers['x-api-key']).toBe('[REDACTED]');
    expect(entry.res.headers['set-cookie']).toBe('[REDACTED]');
    expect(output).not.toContain('auth-secret');
    expect(output).not.toContain('cookie-secret');
    expect(output).not.toContain('api-key-secret');
    expect(output).not.toContain('set-cookie-secret');
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
    expect(id).toMatch(UUID_PATTERN);
  });

  it.each([
    ['an id containing spaces', 'unsafe request id'],
    ['an overlong id', `trace-${'a'.repeat(128)}`],
    ['a repeated header', ['trace-one', 'trace-two']]
  ])('rejects %s and generates a UUID', (_description, incoming) => {
    const id = genReqId({
      headers: { 'x-request-id': incoming }
    } as unknown as Parameters<typeof genReqId>[0]);
    expect(id).toMatch(UUID_PATTERN);
    expect(id).not.toBe(incoming);
  });

  it('does not reflect an unsafe incoming request id', async () => {
    const { server } = buildServer();
    const res = await server.inject({
      method: 'GET',
      url: '/api/health',
      headers: { 'x-request-id': 'unsafe request id' }
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['x-request-id']).toMatch(UUID_PATTERN);
    expect(res.headers['x-request-id']).not.toBe('unsafe request id');
    await server.close();
  });
});
