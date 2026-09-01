import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/index';
import { prisma } from '../src/lib/prisma';
import { validateVisibilityAsset } from '../src/lib/visibility-assets';

const RUN_ID = `visibility-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const assetIds: string[] = [];
let server: FastifyInstance;

function body<T>(payload: string) {
  return JSON.parse(payload) as T;
}

describe('SEO/GEO visibility asset contract', () => {
  beforeAll(async () => {
    await prisma.$connect();
    ({ server } = buildServer());
  });

  afterAll(async () => {
    await prisma.searchVisibilityAsset.deleteMany({ where: { id: { in: assetIds } } });
    await server.close();
    await prisma.$disconnect();
  });

  it('validates metadata deterministically and keeps provider evidence explicit', () => {
    const input = {
      assetKey: `${RUN_ID}-deterministic`,
      mode: 'SEO',
      locale: 'tr-TR',
      canonicalUrl: 'https://www.koseoglu.example/hizmetler/karayolu',
      title: 'Avrupa karayolu taşımacılığı | Köseoğlu Lojistik',
      description: 'Avrupa karayolu taşımacılığında görünür, ölçülebilir ve güvenilir lojistik planı.',
      targetIntents: ['avrupa karayolu taşımacılığı', 'lojistik teklif'],
      robots: 'INDEX_FOLLOW',
    };
    const first = validateVisibilityAsset(input);
    const second = validateVisibilityAsset(input);
    expect(first.contentHash).toBe(second.contentHash);
    expect(first.canonicalUrl).toBe(input.canonicalUrl + '/');
    expect(first.validationReceipt).toMatchObject({ providerEvidence: 'NOT_RUN', indexingEvidence: 'NOT_RUN' });
  });

  it('keeps idempotency, independent approval and disabled provider readiness explicit', async () => {
    const payload = {
      assetKey: `${RUN_ID}-page`,
      mode: 'GEO',
      locale: 'tr',
      canonicalUrl: 'https://www.koseoglu.example/geo/istanbul-avrupa',
      title: 'İstanbul–Avrupa lojistik çözümleri',
      description: 'İstanbul çıkışlı Avrupa lojistik çözümleri için güvenilir planlama ve teklif süreci.',
      targetIntents: ['istanbul avrupa lojistik', 'uluslararası nakliye teklifi'],
      structuredData: { '@context': 'https://schema.org', '@type': 'Service', name: 'Lojistik' },
      author: `${RUN_ID}-author`,
    };
    const createdResponse = await server.inject({ method: 'POST', url: '/api/visibility/assets', payload });
    expect(createdResponse.statusCode).toBe(201);
    const created = body<{ asset: { id: string; status: string }; reused: boolean }>(createdResponse.payload);
    assetIds.push(created.asset.id);
    expect(created).toMatchObject({ reused: false, asset: { status: 'DRAFT' } });

    const reusedResponse = await server.inject({ method: 'POST', url: '/api/visibility/assets', payload });
    expect(reusedResponse.statusCode).toBe(200);
    expect(body<{ reused: boolean }>(reusedResponse.payload).reused).toBe(true);

    const conflictingResponse = await server.inject({
      method: 'POST',
      url: '/api/visibility/assets',
      payload: { ...payload, title: 'Farklı başlık' },
    });
    expect(conflictingResponse.statusCode).toBe(409);

    expect((await server.inject({ method: 'POST', url: `/api/visibility/assets/${created.asset.id}/submit-review` })).statusCode).toBe(200);
    const selfApproval = await server.inject({
      method: 'POST',
      url: `/api/visibility/assets/${created.asset.id}/approve`,
      payload: { reviewedBy: payload.author },
    });
    expect(selfApproval.statusCode).toBe(409);

    const approval = await server.inject({
      method: 'POST',
      url: `/api/visibility/assets/${created.asset.id}/approve`,
      payload: { reviewedBy: `${RUN_ID}-reviewer` },
    });
    expect(approval.statusCode).toBe(200);
    expect(body<{ status: string }>(approval.payload).status).toBe('APPROVED');

    const readiness = await server.inject({ method: 'GET', url: `/api/visibility/assets/${created.asset.id}/readiness` });
    expect(readiness.statusCode).toBe(200);
    expect(body<{ ready: boolean; blockers: string[]; providerEvidence: string }>(readiness.payload)).toMatchObject({
      ready: false,
      providerEvidence: 'NOT_RUN',
    });
    expect(body<{ blockers: string[] }>(readiness.payload).blockers).toEqual(
      expect.arrayContaining(['SEARCH_PROVIDER_EXECUTION_DISABLED', 'PROVIDER_EVIDENCE_NOT_RUN'])
    );
  });

  it('rejects insecure URLs and credential-shaped metadata before persistence', async () => {
    const insecure = await server.inject({
      method: 'POST',
      url: '/api/visibility/assets',
      payload: {
        assetKey: `${RUN_ID}-http`,
        mode: 'SEO',
        locale: 'tr',
        canonicalUrl: 'http://www.koseoglu.example/page',
        title: 'Başlık',
        description: 'Açıklama',
        targetIntents: ['lojistik'],
        author: `${RUN_ID}-author-2`,
      },
    });
    expect(insecure.statusCode).toBe(400);

    const credentialValue = `sk_${'test_credential_value_1234'}`;
    const credential = await server.inject({
      method: 'POST',
      url: '/api/visibility/assets',
      payload: {
        assetKey: `${RUN_ID}-secret`,
        mode: 'GEO',
        locale: 'tr',
        canonicalUrl: 'https://www.koseoglu.example/page',
        title: 'Başlık',
        description: 'Açıklama',
        targetIntents: ['lojistik'],
        structuredData: { providerToken: credentialValue },
        author: `${RUN_ID}-author-3`,
      },
    });
    expect(credential.statusCode).toBe(400);
  });
});
