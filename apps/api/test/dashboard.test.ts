import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/index';
import { getCurrentReportDate } from '../src/lib/reporting';
import { prisma } from '../src/lib/prisma';

let server: FastifyInstance;

beforeAll(async () => {
  await prisma.$connect();
  server = buildServer().server;
});

afterAll(async () => {
  await server.close();
  await prisma.$disconnect();
});

describe('daily action dashboard', () => {
  it('returns bounded aggregate report, ranking and research action sections', async () => {
    const reportDate = getCurrentReportDate();
    const response = await server.inject({
      method: 'GET',
      url: `/api/dashboard/daily?date=${reportDate}&limit=2`,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload) as {
      reportDate: string;
      timezone: string;
      report: { reportDate: string; metrics: Record<string, unknown> };
      ranking: Array<{ company: { id: string; name: string }; totalScore: number; reasons: string[]; nextAction: string }>;
      researchActions: Array<{ candidateId: string; type: string; reasonCodes: string[]; hasContactSignal: boolean }>;
      actualLeadCreated: boolean;
      actualOutreachCreated: boolean;
      actualSendPerformed: boolean;
      externalCallsPerformed: boolean;
    };

    expect(body.reportDate).toBe(reportDate);
    expect(body.timezone).toBe('Europe/Istanbul');
    expect(body.report.reportDate).toBe(reportDate);
    expect(body.ranking.length).toBeLessThanOrEqual(2);
    expect(body.researchActions.length).toBeLessThanOrEqual(2);
    expect(body.actualLeadCreated).toBe(false);
    expect(body.actualOutreachCreated).toBe(false);
    expect(body.actualSendPerformed).toBe(false);
    expect(body.externalCallsPerformed).toBe(false);
    expect(JSON.stringify(body)).not.toMatch(/normalizedValue|contactReceipt|phone|emailDomain|website/);
  });

  it('keeps ranking and research action results bounded by the requested limit', async () => {
    const response = await server.inject({
      method: 'GET',
      url: `/api/dashboard/daily?date=${getCurrentReportDate()}&limit=1`,
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload) as {
      ranking: unknown[];
      researchActions: unknown[];
    };
    expect(body.ranking.length).toBeLessThanOrEqual(1);
    expect(body.researchActions.length).toBeLessThanOrEqual(1);
  });

  it.each([
    ['/api/dashboard/daily?date=not-a-date', 'malformed date'],
    [`/api/dashboard/daily?date=${getCurrentReportDate()}&limit=0`, 'zero limit'],
    [`/api/dashboard/daily?date=${getCurrentReportDate()}&limit=51`, 'over-limit'],
    [`/api/dashboard/daily?date=${getCurrentReportDate()}&unexpected=true`, 'unknown query'],
  ])('rejects %s', async (url) => {
    const response = await server.inject({ method: 'GET', url });
    expect(response.statusCode).toBe(400);
  });
});
