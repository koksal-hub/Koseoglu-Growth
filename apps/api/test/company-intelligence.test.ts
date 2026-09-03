import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/index';
import { prisma } from '../src/lib/prisma';

const RUN_ID = `company-intelligence-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let server: FastifyInstance;
let companyId: string;
const eventIds: string[] = [];

describe('read-only company intelligence timeline', () => {
  beforeAll(async () => {
    await prisma.$connect();
    ({ server } = buildServer());
    const company = await prisma.company.create({
      data: { name: RUN_ID, normalizedName: RUN_ID, sourceDetail: 'company-intelligence-test' },
    });
    companyId = company.id;
    for (const [index, type] of (['COMPANY_DISCOVERED', 'COMPANY_VERIFIED'] as const).entries()) {
      const event = await prisma.event.create({
        data: {
          type,
          entityType: 'Company',
          entityId: company.id,
          actor: 'test-suite',
          occurredAt: new Date(Date.now() - index * 1_000),
          metadata: { internalNote: 'must not be returned' },
        },
      });
      eventIds.push(event.id);
    }
  });

  afterAll(async () => {
    if (eventIds.length > 0) await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
    if (companyId) await prisma.company.deleteMany({ where: { id: companyId } });
    if (server) await server.close();
    await prisma.$disconnect();
  });

  it('returns a bounded timeline without raw event metadata or external actions', async () => {
    const response = await server.inject({ method: 'GET', url: `/api/intelligence/companies/${companyId}/timeline?limit=1` });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload) as {
      company: { id: string; name: string };
      summary: { totalEvents: number; totalEvidence: number; eventTypeCounts: Record<string, number> };
      events: Array<{ id: string; type: string; evidenceCount: number }>;
      policy: { metadataIncluded: boolean; writesPerformed: boolean; externalCallsPerformed: boolean };
    };
    expect(body.company).toMatchObject({ id: companyId, name: RUN_ID });
    expect(body.events).toHaveLength(1);
    expect(body.summary).toMatchObject({ totalEvents: 2, totalEvidence: 0, eventTypeCounts: { COMPANY_DISCOVERED: 1, COMPANY_VERIFIED: 1 } });
    expect(body.events[0]).toHaveProperty('evidenceCount', 0);
    expect(JSON.stringify(body)).not.toContain('internalNote');
    expect(body.policy).toMatchObject({
      metadataIncluded: false,
      writesPerformed: false,
      externalCallsPerformed: false,
    });
  });

  it.each([
    `/api/intelligence/companies/${companyId}/timeline?limit=0`,
    `/api/intelligence/companies/${companyId}/timeline?limit=101`,
    `/api/intelligence/companies/${companyId}/timeline?from=not-a-date`,
    `/api/intelligence/companies/${companyId}/timeline?unexpected=true`,
  ])('rejects invalid bounded query: %s', async (url) => {
    const response = await server.inject({ method: 'GET', url });
    expect(response.statusCode).toBe(400);
  });
});
