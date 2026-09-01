import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/index';
import { prisma } from '../src/lib/prisma';

const RUN_ID = `social-inbox-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const messageIds: string[] = [];
let server: FastifyInstance;

function body<T>(payload: string) {
  return JSON.parse(payload) as T;
}

describe('safe social unified inbox', () => {
  beforeAll(async () => {
    await prisma.$connect();
    ({ server } = buildServer());
  });

  afterAll(async () => {
    await prisma.socialInboxMessage.deleteMany({ where: { id: { in: messageIds } } });
    await server.close();
    await prisma.$disconnect();
  });

  it('deduplicates inbound metadata and requires explicit human classification', async () => {
    const payload = {
      platform: 'LINKEDIN',
      accountKey: `${RUN_ID}-page`,
      externalMessageKey: `${RUN_ID}-message-1`,
      threadKey: `${RUN_ID}-thread-1`,
      senderHandle: 'prospect-42',
      messageType: 'COMMENT',
      receivedAt: '2026-09-01T18:00:00.000Z',
      contentHash: 'a'.repeat(64),
    };
    const created = await server.inject({ method: 'POST', url: '/api/social/inbox/receipts', payload });
    expect(created.statusCode).toBe(201);
    const receipt = body<{ id: string; status: string; intent: string }>(created.payload);
    messageIds.push(receipt.id);
    expect(receipt).toMatchObject({ status: 'RECEIVED', intent: 'UNCLASSIFIED' });

    const reused = await server.inject({ method: 'POST', url: '/api/social/inbox/receipts', payload });
    expect(reused.statusCode).toBe(200);
    expect(body<{ reused: boolean }>(reused.payload).reused).toBe(true);

    const changed = await server.inject({
      method: 'POST',
      url: '/api/social/inbox/receipts',
      payload: { ...payload, contentHash: 'b'.repeat(64) },
    });
    expect(changed.statusCode).toBe(409);

    const classified = await server.inject({
      method: 'POST',
      url: `/api/social/inbox/${receipt.id}/classify`,
      payload: { intent: 'LEAD', reviewedBy: `${RUN_ID}-reviewer` },
    });
    expect(classified.statusCode).toBe(200);
    expect(body<{ status: string; intent: string; classificationReceipt: { method: string; reviewedBy: string } }>(classified.payload)).toMatchObject({
      status: 'CLASSIFIED',
      intent: 'LEAD',
      classificationReceipt: { method: 'HUMAN', reviewedBy: `${RUN_ID}-reviewer` },
    });

    const listed = await server.inject({ method: 'GET', url: '/api/social/inbox?status=CLASSIFIED&intent=LEAD' });
    expect(listed.statusCode).toBe(200);
    expect(body<Array<{ id: string }>>(listed.payload).some((item) => item.id === receipt.id)).toBe(true);
  });

  it('rejects raw text and credential-shaped sender metadata', async () => {
    const rawText = await server.inject({
      method: 'POST',
      url: '/api/social/inbox/receipts',
      payload: {
        platform: 'X',
        accountKey: `${RUN_ID}-x`,
        externalMessageKey: `${RUN_ID}-raw`,
        threadKey: `${RUN_ID}-thread-raw`,
        senderHandle: 'user-raw',
        messageType: 'DIRECT_MESSAGE',
        receivedAt: '2026-09-01T18:00:00.000Z',
        contentHash: 'c'.repeat(64),
        body: 'ham mesaj metni saklanmamalı',
      },
    });
    expect(rawText.statusCode).toBe(400);

    const credentialSender = await server.inject({
      method: 'POST',
      url: '/api/social/inbox/receipts',
      payload: {
        platform: 'X',
        accountKey: `${RUN_ID}-x-credential`,
        externalMessageKey: `${RUN_ID}-credential`,
        threadKey: `${RUN_ID}-thread-credential`,
        senderHandle: `sk_${'test_1234567890abcdef'}`,
        messageType: 'COMMENT',
        receivedAt: '2026-09-01T18:00:00.000Z',
        contentHash: 'd'.repeat(64),
      },
    });
    expect(credentialSender.statusCode).toBe(400);
  });
});
