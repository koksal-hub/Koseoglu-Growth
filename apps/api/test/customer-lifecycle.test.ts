import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/index';
import { prisma } from '../src/lib/prisma';

const RUN_ID = `lifecycle-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const companyIds: string[] = [];
const leadIds: string[] = [];
const opportunityIds: string[] = [];
const activityIds: string[] = [];
let server: FastifyInstance;

describe('read-only customer lifecycle projection', () => {
  beforeAll(async () => {
    await prisma.$connect();
    ({ server } = buildServer());
  });

  afterAll(async () => {
    await prisma.activity.deleteMany({ where: { id: { in: activityIds } } });
    await prisma.opportunity.deleteMany({ where: { id: { in: opportunityIds } } });
    await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
    await server.close();
    await prisma.$disconnect();
  });

  async function company(suffix: string) {
    const created = await prisma.company.create({
      data: { name: `${RUN_ID}-${suffix}`, normalizedName: `${RUN_ID}-${suffix}`, sourceDetail: 'lifecycle-test' },
    });
    companyIds.push(created.id);
    return created;
  }

  it('classifies an untouched company as NEW without writing state', async () => {
    const created = await company('new');
    const response = await server.inject({ method: 'GET', url: `/api/companies/${created.id}/lifecycle` });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload)).toMatchObject({
      companyId: created.id,
      state: 'NEW',
      signals: { leadCount: 0, opportunityCount: 0, activityCount: 0, highValue: { classification: 'NOT_CLASSIFIED' } },
      policy: { writesPerformed: false, externalCallsPerformed: false },
    });
  });

  it('returns REPEAT for two won opportunities and does not invent high-value policy', async () => {
    const created = await company('repeat');
    const lead = await prisma.lead.create({ data: { companyId: created.id, sourceDetail: 'lifecycle-test' } });
    leadIds.push(lead.id);
    for (let index = 0; index < 2; index += 1) {
      const opportunity = await prisma.opportunity.create({
        data: { companyId: created.id, leadId: lead.id, stage: 'WON', estimatedValue: '100000', currency: 'TRY' },
      });
      opportunityIds.push(opportunity.id);
    }
    const response = await server.inject({ method: 'GET', url: `/api/companies/${created.id}/lifecycle` });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload) as { state: string; signals: { wonOpportunityCount: number; highValue: { classification: string } } };
    expect(body.state).toBe('REPEAT');
    expect(body.signals.wonOpportunityCount).toBe(2);
    expect(body.signals.highValue.classification).toBe('NOT_CLASSIFIED');
  });

  it('detects REACTIVATED from a long gap followed by a recent activity', async () => {
    const created = await company('reactivated');
    const lead = await prisma.lead.create({ data: { companyId: created.id, sourceDetail: 'lifecycle-test' } });
    leadIds.push(lead.id);
    const now = Date.now();
    for (const offset of [120, 1]) {
      const activity = await prisma.activity.create({
        data: { leadId: lead.id, type: 'NOTE', occurredAt: new Date(now - offset * 86_400_000), note: 'lifecycle-test' },
      });
      activityIds.push(activity.id);
    }
    const response = await server.inject({ method: 'GET', url: `/api/companies/${created.id}/lifecycle` });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload)).toMatchObject({ state: 'REACTIVATED', signals: { reactivated: true } });
  });

  it('rejects malformed, future, and unknown company requests', async () => {
    const future = await server.inject({ method: 'GET', url: `/api/companies/${RUN_ID}-missing/lifecycle?asOf=${new Date(Date.now() + 10 * 60 * 1000).toISOString()}` });
    expect(future.statusCode).toBe(400);
    const missing = await server.inject({ method: 'GET', url: `/api/companies/${RUN_ID}-missing/lifecycle` });
    expect(missing.statusCode).toBe(404);
  });
});
