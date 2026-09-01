import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/index';
import { enqueueJob } from '../src/lib/job-queue';
import {
  generateManagementReport,
  getCurrentReportDate,
  getReportWindow,
  recordUsageReceipt,
  REPORT_TIMEZONE,
} from '../src/lib/reporting';
import { prisma } from '../src/lib/prisma';

const RUN_ID = `report-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const reportDate = getCurrentReportDate();
const jobIds: string[] = [];
const eventIds: string[] = [];
const usageIds: string[] = [];
let server: FastifyInstance;

function metricsOf(value: unknown) {
  return value as {
    jobs: { created: number; byStatus: Record<string, number> };
    usage: { receipts: number; inputTokens: number; outputTokens: number; costMinorByCurrency: Record<string, number> };
    safety: { realExternalActionsRecorded: number; unverifiedAiCalls: number };
  };
}

describe('management reporting and usage receipts', () => {
  beforeAll(async () => {
    await prisma.$connect();
    await prisma.managementReport.deleteMany({ where: { reportKey: `${reportDate}:${REPORT_TIMEZONE}` } });
    await prisma.usageReceipt.deleteMany({ where: { idempotencyKey: { startsWith: `${RUN_ID}-` } } });
    await prisma.event.deleteMany({ where: { entityId: RUN_ID } });
    await prisma.job.deleteMany({ where: { type: { startsWith: RUN_ID } } });
    ({ server } = buildServer());
  });

  afterAll(async () => {
    await server.close();
    await prisma.managementReport.deleteMany({ where: { reportKey: `${reportDate}:${REPORT_TIMEZONE}` } });
    await prisma.usageReceipt.deleteMany({ where: { id: { in: usageIds } } });
    await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
    await prisma.job.deleteMany({ where: { id: { in: jobIds } } });
    await prisma.$disconnect();
  });

  it('uses an explicit Europe/Istanbul calendar window', () => {
    const window = getReportWindow('2026-09-01');
    expect(window.timezone).toBe(REPORT_TIMEZONE);
    expect(window.periodStart.toISOString()).toBe('2026-08-31T21:00:00.000Z');
    expect(window.periodEnd.toISOString()).toBe('2026-09-01T21:00:00.000Z');
    expect(() => getReportWindow('2026-02-30')).toThrow(/valid calendar date/);
  });

  it('records usage once and blocks a conflicting idempotency receipt', async () => {
    const input = {
      provider: 'local-test',
      model: 'deterministic-v1',
      operation: 'classification',
      idempotencyKey: `${RUN_ID}-usage`,
      inputTokens: 100,
      outputTokens: 25,
      costMinor: 7,
      currency: 'USD',
      metadata: { b: 2, a: 1, requestId: RUN_ID },
    };
    const first = await recordUsageReceipt(input);
    usageIds.push(first.id);
    const repeat = await recordUsageReceipt({ ...input, metadata: { requestId: RUN_ID, a: 1, b: 2 } });
    expect(repeat.id).toBe(first.id);
    await expect(recordUsageReceipt({ ...input, outputTokens: 26 })).rejects.toMatchObject({ statusCode: 409 });
    await expect(
      recordUsageReceipt({ ...input, idempotencyKey: `${RUN_ID}-secret`, metadata: { value: 'sk_test_1234567890abcdef' } })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('aggregates deterministic KPIs and reuses an unchanged daily snapshot', async () => {
    const job = await enqueueJob({
      type: `${RUN_ID}-report-job`,
      payload: { purpose: 'reporting' },
      idempotencyKey: `${RUN_ID}-report-job`,
      runAt: new Date(Date.now() + 86_400_000),
    });
    jobIds.push(job.id);
    const event = await prisma.event.create({
      data: { type: 'COMPANY_DISCOVERED', entityType: 'report-test', entityId: RUN_ID, actor: 'report-test' },
    });
    eventIds.push(event.id);

    const first = await generateManagementReport(reportDate);
    expect(first.reused).toBe(false);
    const firstMetrics = metricsOf(first.report.metrics);
    expect(firstMetrics.jobs.created).toBeGreaterThanOrEqual(1);
    expect(firstMetrics.usage.receipts).toBeGreaterThanOrEqual(1);
    expect(firstMetrics.usage.costMinorByCurrency.USD).toBeGreaterThanOrEqual(7);
    expect(firstMetrics.safety.realExternalActionsRecorded).toBe(0);
    expect(firstMetrics.safety.unverifiedAiCalls).toBe(0);

    const repeat = await generateManagementReport(reportDate);
    expect(repeat.reused).toBe(true);
    expect(repeat.report.id).toBe(first.report.id);
    expect(repeat.report.inputHash).toBe(first.report.inputHash);
  });

  it('serves aggregate report data and rejects malformed dates', async () => {
    const response = await server.inject({ method: 'GET', url: `/api/reports/management?date=${reportDate}` });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload) as { report: { reportDate: string; timezone: string } };
    expect(body.report.reportDate).toBe(reportDate);
    expect(body.report.timezone).toBe(REPORT_TIMEZONE);

    const invalid = await server.inject({ method: 'GET', url: '/api/reports/management?date=not-a-date' });
    expect(invalid.statusCode).toBe(400);
  });
});
