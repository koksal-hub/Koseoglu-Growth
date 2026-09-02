import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/index';
import { prisma } from '../src/lib/prisma';

const RUN_ID = `measurement-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const exposureIds: string[] = [];
let server: FastifyInstance;

function payload<T>(value: string) {
  return JSON.parse(value) as T;
}

describe('recommendation exposure and outcome measurement', () => {
  beforeAll(async () => {
    await prisma.$connect();
    ({ server } = buildServer());
  });

  afterAll(async () => {
    await prisma.recommendationOutcome.deleteMany({ where: { exposureId: { in: exposureIds } } });
    await prisma.recommendationExposure.deleteMany({ where: { id: { in: exposureIds } } });
    await server.close();
    await prisma.$disconnect();
  });

  it('records idempotent exposure lineage with exploration metadata', async () => {
    const input = {
      exposureKey: `${RUN_ID}-exposure`,
      recommendationType: 'LEAD_RANKING',
      recommendationId: `${RUN_ID}-ranking`,
      algorithmVersion: 'deterministic-ranking-v1',
      inputHash: 'a'.repeat(64),
      mode: 'EXPLORATION',
      position: 2,
      actor: `${RUN_ID}-operator`,
      exposedAt: new Date().toISOString()
    };
    const createdResponse = await server.inject({ method: 'POST', url: '/api/recommendation-exposures', payload: input });
    expect(createdResponse.statusCode).toBe(201);
    const created = payload<{ exposure: { id: string; mode: string; position: number }; reused: boolean }>(createdResponse.payload);
    exposureIds.push(created.exposure.id);
    expect(created).toMatchObject({ reused: false, exposure: { mode: 'EXPLORATION', position: 2 } });

    const reused = await server.inject({ method: 'POST', url: '/api/recommendation-exposures', payload: input });
    expect(reused.statusCode).toBe(200);
    expect(payload<{ reused: boolean }>(reused.payload).reused).toBe(true);

    const conflict = await server.inject({
      method: 'POST',
      url: '/api/recommendation-exposures',
      payload: { ...input, position: 3 }
    });
    expect(conflict.statusCode).toBe(409);

    const list = await server.inject({
      method: 'GET',
      url: `/api/recommendation-exposures?recommendationType=LEAD_RANKING&recommendationId=${input.recommendationId}`
    });
    expect(list.statusCode).toBe(200);
    expect(payload<Array<{ id: string; outcomes: unknown[] }>>(list.payload)).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: created.exposure.id, outcomes: [] })])
    );
  });

  it('records explicit outcomes without inferring them from scores', async () => {
    const exposure = await prisma.recommendationExposure.findUniqueOrThrow({ where: { id: exposureIds[0] } });
    const input = {
      outcomeKey: `${RUN_ID}-human-action`,
      outcomeType: 'HUMAN_ACTION',
      occurredAt: new Date().toISOString(),
      sourceRef: `${RUN_ID}-crm-note`,
      recordedBy: `${RUN_ID}-operator`
    };
    const createdResponse = await server.inject({
      method: 'POST',
      url: `/api/recommendation-exposures/${exposure.id}/outcomes`,
      payload: input
    });
    expect(createdResponse.statusCode).toBe(201);
    expect(payload<{ reused: boolean }>(createdResponse.payload).reused).toBe(false);

    const reused = await server.inject({
      method: 'POST',
      url: `/api/recommendation-exposures/${exposure.id}/outcomes`,
      payload: input
    });
    expect(reused.statusCode).toBe(200);
    expect(payload<{ reused: boolean }>(reused.payload).reused).toBe(true);

    const conflict = await server.inject({
      method: 'POST',
      url: `/api/recommendation-exposures/${exposure.id}/outcomes`,
      payload: { ...input, recordedBy: `${RUN_ID}-other-operator` }
    });
    expect(conflict.statusCode).toBe(409);

    const missingValue = await server.inject({
      method: 'POST',
      url: `/api/recommendation-exposures/${exposure.id}/outcomes`,
      payload: {
        outcomeKey: `${RUN_ID}-gross-profit-invalid`,
        outcomeType: 'GROSS_PROFIT',
        occurredAt: new Date().toISOString(),
        sourceRef: `${RUN_ID}-finance-note`,
        recordedBy: `${RUN_ID}-operator`
      }
    });
    expect(missingValue.statusCode).toBe(400);

    const grossProfit = await server.inject({
      method: 'POST',
      url: `/api/recommendation-exposures/${exposure.id}/outcomes`,
      payload: {
        outcomeKey: `${RUN_ID}-gross-profit`,
        outcomeType: 'GROSS_PROFIT',
        occurredAt: new Date().toISOString(),
        valueMinor: 125000,
        currency: 'TRY',
        sourceRef: `${RUN_ID}-finance-note`,
        recordedBy: `${RUN_ID}-operator`
      }
    });
    expect(grossProfit.statusCode).toBe(201);
  });

  it('rejects invalid position and future exposure time', async () => {
    const base = {
      exposureKey: `${RUN_ID}-invalid`,
      recommendationType: 'RESEARCH_ACTION',
      recommendationId: `${RUN_ID}-action`,
      algorithmVersion: 'research-actions-v1',
      inputHash: 'b'.repeat(64),
      mode: 'EXPLOITATION',
      actor: `${RUN_ID}-operator`,
      exposedAt: new Date().toISOString()
    };
    const invalidPosition = await server.inject({ method: 'POST', url: '/api/recommendation-exposures', payload: { ...base, position: 0 } });
    expect(invalidPosition.statusCode).toBe(400);
    const future = await server.inject({
      method: 'POST',
      url: '/api/recommendation-exposures',
      payload: { ...base, position: 1, exposedAt: new Date(Date.now() + 10 * 60 * 1000).toISOString() }
    });
    expect(future.statusCode).toBe(400);
  });
});
