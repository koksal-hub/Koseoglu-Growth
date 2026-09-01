import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/index';
import { prisma } from '../src/lib/prisma';

const RUN_ID = `social-route-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const masterIds: string[] = [];
let server: FastifyInstance;

function body<T>(payload: string) {
  return JSON.parse(payload) as T;
}

describe('social composer approval and scheduling API', () => {
  beforeAll(async () => {
    await prisma.$connect();
    await prisma.job.deleteMany({ where: { idempotencyKey: { startsWith: 'social-publish:' } } });
    ({ server } = buildServer());
  });

  afterAll(async () => {
    await prisma.job.deleteMany({ where: { idempotencyKey: { startsWith: 'social-publish:' } } });
    await prisma.socialAttributionReceipt.deleteMany({ where: { variant: { masterContentId: { in: masterIds } } } });
    await prisma.socialContentVariant.deleteMany({ where: { masterContentId: { in: masterIds } } });
    await prisma.masterContent.deleteMany({ where: { id: { in: masterIds } } });
    await server.close();
    await prisma.$disconnect();
  });

  it('keeps the master → variant → independent approval → scheduled job flow explicit', async () => {
    const masterResponse = await server.inject({
      method: 'POST',
      url: '/api/social/master-content',
      payload: {
        title: `Avrupa taşıma fırsatları ${RUN_ID}`,
        body: 'Köseoğlu Lojistik ile Avrupa hatlarında güvenilir ve ölçülebilir taşıma planı.',
        author: `${RUN_ID}-author`,
      },
    });
    expect(masterResponse.statusCode).toBe(201);
    const master = body<{ id: string }>(masterResponse.payload);
    masterIds.push(master.id);

    const variantResponse = await server.inject({
      method: 'POST',
      url: `/api/social/master-content/${master.id}/variants`,
      payload: {
        platform: 'X',
        body: 'Avrupa taşımalarında görünür takip ve güvenilir planlama. #lojistik',
        author: `${RUN_ID}-author`,
        idempotencyKey: `${RUN_ID}-x-variant`,
      },
    });
    expect(variantResponse.statusCode).toBe(201);
    const variant = body<{ id: string; status: string }>(variantResponse.payload);
    expect(variant.status).toBe('DRAFT');

    expect((await server.inject({ method: 'POST', url: `/api/social/master-content/${master.id}/submit-review` })).statusCode).toBe(200);
    const selfMasterApproval = await server.inject({
      method: 'POST',
      url: `/api/social/master-content/${master.id}/approve`,
      payload: { reviewedBy: `${RUN_ID}-author` },
    });
    expect(selfMasterApproval.statusCode).toBe(409);
    expect((await server.inject({
      method: 'POST',
      url: `/api/social/master-content/${master.id}/approve`,
      payload: { reviewedBy: `${RUN_ID}-reviewer` },
    })).statusCode).toBe(200);

    expect((await server.inject({ method: 'POST', url: `/api/social/variants/${variant.id}/submit-review` })).statusCode).toBe(200);
    const selfVariantApproval = await server.inject({
      method: 'POST',
      url: `/api/social/variants/${variant.id}/approve`,
      payload: { reviewedBy: `${RUN_ID}-author` },
    });
    expect(selfVariantApproval.statusCode).toBe(409);
    const approved = await server.inject({
      method: 'POST',
      url: `/api/social/variants/${variant.id}/approve`,
      payload: { reviewedBy: `${RUN_ID}-reviewer` },
    });
    expect(approved.statusCode).toBe(200);
    expect(body<{ status: string }>(approved.payload).status).toBe('APPROVED');

    const scheduled = await server.inject({
      method: 'POST',
      url: `/api/social/variants/${variant.id}/schedule`,
      payload: { scheduledAt: new Date(Date.now() + 60_000).toISOString() },
    });
    expect(scheduled.statusCode).toBe(200);
    const scheduledBody = body<{ variant: { status: string }; job: { type: string; idempotencyKey: string } }>(scheduled.payload);
    expect(scheduledBody.variant.status).toBe('SCHEDULED');
    expect(scheduledBody.job.type).toBe('SOCIAL_PUBLISH');
    expect(scheduledBody.job.idempotencyKey).toMatch(/^social-publish:/);

    const readiness = await server.inject({
      method: 'GET',
      url: `/api/social/variants/${variant.id}/publish-readiness`,
    });
    expect(readiness.statusCode).toBe(200);
    const readinessBody = body<{ ready: boolean; blockers: string[]; adapterRegistered: boolean }>(readiness.payload);
    expect(readinessBody.ready).toBe(false);
    expect(readinessBody.adapterRegistered).toBe(false);
    expect(readinessBody.blockers).toEqual(
      expect.arrayContaining(['NO_CONNECTED_ACCOUNT', 'NO_PROVIDER_ADAPTER', 'PUBLISH_EXECUTION_DISABLED'])
    );

    const delivery = await server.inject({
      method: 'GET',
      url: `/api/social/variants/${variant.id}/delivery`,
    });
    expect(delivery.statusCode).toBe(200);
    expect(body<{ deliveryState: string; providerVerified: boolean }>(delivery.payload)).toMatchObject({
      deliveryState: 'QUEUED_PROVIDER_UNVERIFIED',
      providerVerified: false,
    });

    const attributionPayload = {
      destinationUrl: 'https://www.koseoglu.example/avrupa-tasimacilik',
      utmSource: 'linkedin',
      utmMedium: 'social',
      utmCampaign: 'avrupa-lane-2026',
      utmContent: 'x-variant',
    };
    const attribution = await server.inject({
      method: 'POST',
      url: `/api/social/variants/${variant.id}/attribution`,
      payload: attributionPayload,
    });
    expect(attribution.statusCode).toBe(201);
    const reusedAttribution = await server.inject({
      method: 'POST',
      url: `/api/social/variants/${variant.id}/attribution`,
      payload: attributionPayload,
    });
    expect(reusedAttribution.statusCode).toBe(200);
    expect(body<{ reused: boolean }>(reusedAttribution.payload).reused).toBe(true);
    const conflictingAttribution = await server.inject({
      method: 'POST',
      url: `/api/social/variants/${variant.id}/attribution`,
      payload: { ...attributionPayload, utmCampaign: 'different-campaign' },
    });
    expect(conflictingAttribution.statusCode).toBe(409);

    const duplicateSchedule = await server.inject({
      method: 'POST',
      url: `/api/social/variants/${variant.id}/schedule`,
      payload: { scheduledAt: new Date(Date.now() + 120_000).toISOString() },
    });
    expect(duplicateSchedule.statusCode).toBe(409);
  });

  it('rejects a variant that exceeds the X product guardrail', async () => {
    const masterResponse = await server.inject({
      method: 'POST',
      url: '/api/social/master-content',
      payload: { title: `Long variant ${RUN_ID}`, body: 'master body', author: `${RUN_ID}-author-2` },
    });
    const master = body<{ id: string }>(masterResponse.payload);
    masterIds.push(master.id);
    const response = await server.inject({
      method: 'POST',
      url: `/api/social/master-content/${master.id}/variants`,
      payload: {
        platform: 'X',
        body: 'x'.repeat(281),
        author: `${RUN_ID}-author-2`,
        idempotencyKey: `${RUN_ID}-long-x`,
      },
    });
    expect(response.statusCode).toBe(400);
  });
});
