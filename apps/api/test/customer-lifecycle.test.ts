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

  it('reports a won pipeline as DEVELOPING without claiming a shipped repeat', async () => {
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
    const body = JSON.parse(response.payload) as {
      state: string;
      signals: {
        wonOpportunityCount: number;
        repeatEvidence: { basis: string };
        highValue: { classification: string };
      };
    };
    // BC4: won opportunities stay visible as commercial signals, but they are a
    // pipeline belief, so the state must not assert a shipped repeat.
    expect(body.state).toBe('DEVELOPING');
    expect(body.signals.wonOpportunityCount).toBe(2);
    expect(body.signals.repeatEvidence.basis).toBe('PIPELINE_ONLY_UNCONFIRMED');
    expect(body.signals.highValue.classification).toBe('NOT_CLASSIFIED');
  });

  it('does not claim REPEAT from pipeline labels alone (BC4: shipment truth is required)', async () => {
    const created = await company('pipeline-repeat');
    const lead = await prisma.lead.create({ data: { companyId: created.id, sourceDetail: 'lifecycle-test' } });
    leadIds.push(lead.id);
    for (let index = 0; index < 3; index += 1) {
      const opportunity = await prisma.opportunity.create({
        data: { companyId: created.id, leadId: lead.id, stage: 'WON', estimatedValue: '100000', currency: 'TRY' },
      });
      opportunityIds.push(opportunity.id);
    }
    const response = await server.inject({ method: 'GET', url: `/api/companies/${created.id}/lifecycle` });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload) as {
      policyVersion: string;
      state: string;
      signals: { wonOpportunityCount: number; repeatEvidence: Record<string, unknown> };
      policy: { repeatRequiresShippedEvidence: boolean };
    };
    // A won opportunity is a CRM belief, not a delivery record: the old policy
    // asserted REPEAT here, the v2 contract refuses that claim.
    expect(body.policyVersion).toBe('customer-lifecycle-signals-v2');
    expect(body.state).not.toBe('REPEAT');
    expect(body.state).toBe('DEVELOPING');
    expect(body.signals.wonOpportunityCount).toBe(3);
    expect(body.signals.repeatEvidence).toMatchObject({
      basis: 'PIPELINE_ONLY_UNCONFIRMED',
      pipelineWonCount: 3,
      pipelineWonThreshold: 2,
      operationsShipmentSource: 'NOT_AVAILABLE'
    });
    expect(body.policy.repeatRequiresShippedEvidence).toBe(true);
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

  it.each([
    ['developing', 'DEVELOPING', null],
    ['cooling', 'COOLING', 45],
    ['dormant', 'DORMANT', 120],
  ] as const)('classifies %s from bounded activity signals', async (suffix, expectedState, activityAgeDays) => {
    const created = await company(suffix);
    const lead = await prisma.lead.create({ data: { companyId: created.id, sourceDetail: 'lifecycle-test' } });
    leadIds.push(lead.id);
    if (activityAgeDays !== null) {
      const activity = await prisma.activity.create({
        data: {
          leadId: lead.id,
          type: 'NOTE',
          occurredAt: new Date(Date.now() - activityAgeDays * 86_400_000),
          note: 'lifecycle-test',
        },
      });
      activityIds.push(activity.id);
    }
    const response = await server.inject({ method: 'GET', url: `/api/companies/${created.id}/lifecycle` });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload)).toMatchObject({ state: expectedState });
  });

  it('rejects malformed, future, and unknown company requests', async () => {
    const future = await server.inject({ method: 'GET', url: `/api/companies/${RUN_ID}-missing/lifecycle?asOf=${new Date(Date.now() + 10 * 60 * 1000).toISOString()}` });
    expect(future.statusCode).toBe(400);
    const missing = await server.inject({ method: 'GET', url: `/api/companies/${RUN_ID}-missing/lifecycle` });
    expect(missing.statusCode).toBe(404);
  });
});
