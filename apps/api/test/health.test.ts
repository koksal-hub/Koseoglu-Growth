import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/index';

let server: FastifyInstance;

beforeAll(() => {
  const built = buildServer();
  server = built.server;
});

afterAll(async () => {
  if (server && typeof server.close === 'function') await server.close();
});

describe('GET /api/health', () => {
  it('returns status ok', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body).toEqual({ status: 'ok' });
  });
});
