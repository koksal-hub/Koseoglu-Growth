import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/index';
import { prisma } from '../src/lib/prisma';

const RUN_ID = `social-connection-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const connectionIds: string[] = [];
let server: FastifyInstance;

function body<T>(payload: string) {
  return JSON.parse(payload) as T;
}

describe('social connection lifecycle and publish readiness gate', () => {
  beforeAll(async () => {
    await prisma.$connect();
    ({ server } = buildServer());
  });

  afterAll(async () => {
    await prisma.socialConnection.deleteMany({ where: { id: { in: connectionIds } } });
    await server.close();
    await prisma.$disconnect();
  });

  it('stores only credential-free connection metadata and blocks fake CONNECTED status', async () => {
    const created = await server.inject({
      method: 'POST',
      url: '/api/social/connections',
      payload: {
        platform: 'LINKEDIN',
        accountKey: `${RUN_ID}-company-page`,
        accountLabel: 'Köseoğlu Lojistik şirket sayfası',
        secretManagerRef: 'vault://social/linkedin/company-page',
        scopes: { publish_pages: true, read_analytics: true },
      },
    });
    expect(created.statusCode).toBe(201);
    const connection = body<{ id: string; status: string; secretManagerRef?: string }>(created.payload);
    connectionIds.push(connection.id);
    expect(connection.status).toBe('DISCONNECTED');
    expect(connection.secretManagerRef).toBe('vault://social/linkedin/company-page');

    const listed = await server.inject({ method: 'GET', url: '/api/social/connections?limit=10' });
    expect(listed.statusCode).toBe(200);
    expect(body<Array<{ id: string }>>(listed.payload).some((item) => item.id === connection.id)).toBe(true);

    const fakeConnected = await server.inject({
      method: 'POST',
      url: `/api/social/connections/${connection.id}/status`,
      payload: { status: 'CONNECTED' },
    });
    expect(fakeConnected.statusCode).toBe(409);

    const reauth = await server.inject({
      method: 'POST',
      url: `/api/social/connections/${connection.id}/status`,
      payload: { status: 'REAUTH_REQUIRED' },
    });
    expect(reauth.statusCode).toBe(200);
    expect(body<{ status: string }>(reauth.payload).status).toBe('REAUTH_REQUIRED');
  });

  it('rejects credential-shaped metadata before persistence', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/social/connections',
      payload: {
        platform: 'X',
        accountKey: `${RUN_ID}-blocked`,
        scopes: { access_token: 'synthetic-token-value' },
      },
    });
    expect(response.statusCode).toBe(400);
  });
});
