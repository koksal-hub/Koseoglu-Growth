import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/index';
import { prisma } from '../src/lib/prisma';

const RUN_ID = `measurement-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const exposureIds: string[] = [];
const eventIds: string[] = [];
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
    await prisma.recommendationOutcomeProvenanceReview.deleteMany({ where: { outcome: { exposureId: { in: exposureIds } } } });
    await prisma.recommendationOutcome.deleteMany({ where: { exposureId: { in: exposureIds } } });
    await prisma.recommendationExposure.deleteMany({ where: { id: { in: exposureIds } } });
    await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
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
      sourceType: 'HUMAN_NOTE',
      sourceId: `${RUN_ID}-note-1`,
      recordedBy: `${RUN_ID}-operator`
    };
    const createdResponse = await server.inject({
      method: 'POST',
      url: `/api/recommendation-exposures/${exposure.id}/outcomes`,
      payload: input
    });
    expect(createdResponse.statusCode).toBe(201);
    const createdHumanOutcome = payload<{ outcome: { id: string }; reused: boolean }>(createdResponse.payload);
    expect(createdHumanOutcome.reused).toBe(false);

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

    const missingSourceId = await server.inject({
      method: 'POST',
      url: `/api/recommendation-exposures/${exposure.id}/outcomes`,
      payload: {
        outcomeKey: `${RUN_ID}-missing-source-id`,
        outcomeType: 'LEAD_CREATED',
        occurredAt: new Date().toISOString(),
        sourceType: 'CRM_LEAD',
        recordedBy: `${RUN_ID}-operator`
      }
    });
    expect(missingSourceId.statusCode).toBe(400);

    const missingCrmSource = await server.inject({
      method: 'POST',
      url: `/api/recommendation-exposures/${exposure.id}/outcomes`,
      payload: {
        outcomeKey: `${RUN_ID}-missing-crm-source`,
        outcomeType: 'LEAD_CREATED',
        occurredAt: new Date().toISOString(),
        sourceType: 'CRM_LEAD',
        sourceId: `${RUN_ID}-lead-does-not-exist`,
        recordedBy: `${RUN_ID}-operator`
      }
    });
    expect(missingCrmSource.statusCode).toBe(404);

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

    const event = await prisma.event.create({
      data: {
        type: 'LEAD_CREATED',
        entityType: 'RecommendationOutcome',
        entityId: `${RUN_ID}-event-entity`,
        actor: `${RUN_ID}-event-actor`,
        metadata: { source: 'test' }
      }
    });
    eventIds.push(event.id);
    const crmOutcomeResponse = await server.inject({
      method: 'POST',
      url: `/api/recommendation-exposures/${exposure.id}/outcomes`,
      payload: {
        outcomeKey: `${RUN_ID}-crm-event-outcome`,
        outcomeType: 'LEAD_CREATED',
        occurredAt: new Date().toISOString(),
        sourceType: 'CRM_EVENT',
        sourceId: event.id,
        recordedBy: `${RUN_ID}-operator`
      }
    });
    expect(crmOutcomeResponse.statusCode).toBe(201);
    const crmOutcome = payload<{ outcome: { id: string } }>(crmOutcomeResponse.payload).outcome;

    const reviewInput = {
      reviewKey: `${RUN_ID}-provenance-review`,
      decision: 'APPROVED',
      reviewedBy: `${RUN_ID}-independent-reviewer`,
      reason: 'Yerel CRM olay kaydı insan tarafından doğrulandı.'
    };
    const reviewResponse = await server.inject({
      method: 'POST',
      url: `/api/recommendation-outcomes/${crmOutcome.id}/provenance-review`,
      payload: reviewInput
    });
    expect(reviewResponse.statusCode).toBe(201);
    expect(payload<{ reused: boolean; review: { decision: string; reviewedBy: string } }>(reviewResponse.payload)).toMatchObject({
      reused: false,
      review: { decision: 'APPROVED', reviewedBy: reviewInput.reviewedBy }
    });

    const reusedReview = await server.inject({
      method: 'POST',
      url: `/api/recommendation-outcomes/${crmOutcome.id}/provenance-review`,
      payload: reviewInput
    });
    expect(reusedReview.statusCode).toBe(200);
    expect(payload<{ reused: boolean }>(reusedReview.payload).reused).toBe(true);

    const listedWithReview = await server.inject({
      method: 'GET',
      url: `/api/recommendation-exposures?recommendationType=LEAD_RANKING&recommendationId=${encodeURIComponent(`${RUN_ID}-ranking`)}`
    });
    expect(listedWithReview.statusCode).toBe(200);
    expect(payload<Array<{ outcomes: Array<{ provenanceReview?: { decision: string } | null }> }>>(listedWithReview.payload)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          outcomes: expect.arrayContaining([expect.objectContaining({ provenanceReview: expect.objectContaining({ decision: 'APPROVED' }) })])
        })
      ])
    );

    const conflictingReview = await server.inject({
      method: 'POST',
      url: `/api/recommendation-outcomes/${crmOutcome.id}/provenance-review`,
      payload: { ...reviewInput, decision: 'REJECTED' }
    });
    expect(conflictingReview.statusCode).toBe(409);

    const secondReviewKey = await server.inject({
      method: 'POST',
      url: `/api/recommendation-outcomes/${crmOutcome.id}/provenance-review`,
      payload: { ...reviewInput, reviewKey: `${RUN_ID}-second-review-key` }
    });
    expect(secondReviewKey.statusCode).toBe(409);

    const metadataOnlyReview = await server.inject({
      method: 'POST',
      url: `/api/recommendation-outcomes/${createdHumanOutcome.outcome.id}/provenance-review`,
      payload: { ...reviewInput, reviewKey: `${RUN_ID}-metadata-only-review` }
    });
    expect(metadataOnlyReview.statusCode).toBe(409);

    const sameRecorderOutcome = await server.inject({
      method: 'POST',
      url: `/api/recommendation-exposures/${exposure.id}/outcomes`,
      payload: {
        outcomeKey: `${RUN_ID}-same-recorder-outcome`,
        outcomeType: 'LEAD_CREATED',
        occurredAt: new Date().toISOString(),
        sourceType: 'CRM_EVENT',
        sourceId: event.id,
        recordedBy: `${RUN_ID}-same-recorder`
      }
    });
    expect(sameRecorderOutcome.statusCode).toBe(201);
    const sameRecorderOutcomeId = payload<{ outcome: { id: string } }>(sameRecorderOutcome.payload).outcome.id;
    const sameRecorderReview = await server.inject({
      method: 'POST',
      url: `/api/recommendation-outcomes/${sameRecorderOutcomeId}/provenance-review`,
      payload: { ...reviewInput, reviewKey: `${RUN_ID}-same-recorder-review`, reviewedBy: `${RUN_ID}-same-recorder` }
    });
    expect(sameRecorderReview.statusCode).toBe(409);
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
