import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/index';
import { prisma } from '../src/lib/prisma';

const RUN_ID = `company-intelligence-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let server: FastifyInstance;
let companyId: string;
const eventIds: string[] = [];
const evidenceIds: string[] = [];

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
    const evidence = await prisma.evidence.create({
      data: {
        companyId: company.id,
        sourceUrl: 'https://example.com/company?utm_source=test',
        sourceName: 'Test source',
        claimKey: 'sector',
        summary: 'Untrusted source summary',
        confidence: 0.8,
      },
    });
    evidenceIds.push(evidence.id);
    for (const claimKey of ['market.demand', 'supply_chain.route']) {
      const signal = await prisma.evidence.create({
        data: { companyId: company.id, sourceUrl: 'https://example.com/signal', claimKey, summary: claimKey, confidence: 0.7 },
      });
      evidenceIds.push(signal.id);
    }
  });

  afterAll(async () => {
    if (evidenceIds.length > 0) await prisma.evidence.deleteMany({ where: { id: { in: evidenceIds } } });
    if (eventIds.length > 0) await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
    if (companyId) await prisma.company.deleteMany({ where: { id: companyId } });
    if (server) await server.close();
    await prisma.$disconnect();
  });

  it('returns an evidence brief with origin-only sources and explicit untrusted text', async () => {
    const response = await server.inject({ method: 'GET', url: `/api/intelligence/companies/${companyId}/evidence-brief?limit=1` });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload) as {
      evidence: Array<{ sourceOrigin: string | null; summary: string; summaryTrust: string }>;
      policy: { rawSourceUrlIncluded: boolean; metadataIncluded: boolean; writesPerformed: boolean; externalCallsPerformed: boolean };
    };
    expect(body.evidence).toHaveLength(1);
    expect(body.evidence[0]).toMatchObject({ sourceOrigin: 'https://example.com', summary: 'Untrusted source summary', summaryTrust: 'UNTRUSTED_SOURCE_TEXT' });
    expect(JSON.stringify(body)).not.toContain('utm_source');
    expect(body.policy).toEqual({
      maxLimit: 100,
      maxWindowDays: 366,
      rawSourceUrlIncluded: false,
      metadataIncluded: false,
      writesPerformed: false,
      externalCallsPerformed: false,
    });
  });

  it('classifies market and supply-chain evidence deterministically', async () => {
    const response = await server.inject({ method: 'GET', url: `/api/intelligence/companies/${companyId}/insights?category=SUPPLY_CHAIN&limit=10` });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload) as {
      category: string;
      evidence: Array<{ category: string; claimKey: string }>;
      summary: { totalEvidence: number; returnedEvidence: number; truncated: boolean; categoryCounts: Record<string, number> };
    };
    expect(body.category).toBe('SUPPLY_CHAIN');
    expect(body.evidence).toEqual([expect.objectContaining({ category: 'SUPPLY_CHAIN', claimKey: 'supply_chain.route' })]);
    expect(body.summary).toMatchObject({ totalEvidence: 3, returnedEvidence: 1, truncated: false, categoryCounts: { COMPANY: 0, MARKET: 0, SUPPLY_CHAIN: 1 } });
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
