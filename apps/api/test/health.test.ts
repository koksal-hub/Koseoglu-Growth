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
  it('returns status ok without touching the database (liveness)', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body).toEqual({ status: 'ok' });
  });
});

describe('GET /api/ready', () => {
  it('returns status ready when the database is reachable (readiness)', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/ready' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body).toEqual({ status: 'ready' });
  });
});
