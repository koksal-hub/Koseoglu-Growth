import { createHmac } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildServer } from '../src/index';
import {
  buildRecipientHash,
  createContactPoint,
  recordCommunicationPermission,
  verifyContactPoint,
} from '../src/lib/contact-points';
import {
  createResendTestProvider,
  resolveSandboxRecipient,
  sha256,
  verifySvixWebhook,
} from '../src/lib/email-provider';
import type { FetchImplementation } from '../src/lib/email-provider';
import {
  createOutreachDraft,
  decideOutreachDraft,
  submitOutreachDraftForReview,
} from '../src/lib/outreach-drafts';
import { prisma } from '../src/lib/prisma';
import { recordCompanyRanking } from '../src/lib/ranking';
import {
  createEmailSandboxDispatchService,
  prepareSandboxSendAttempt,
  recoverStaleSandboxDispatch,
  STALE_DISPATCH_LEASE_MINUTES,
} from '../src/lib/send-attempts';
import { validateEnv } from '../src/plugins/env';

const RUN_ID = `email-sandbox-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const POLICY_VERSION = 'communication-policy-email-sandbox-v1';
const webhookSecretBytes = Buffer.alloc(32, 7);
const WEBHOOK_SECRET = `whsec_${webhookSecretBytes.toString('base64')}`;
let server: FastifyInstance;
let previousWebhookSecret: string | undefined;

const DISPATCH_ENV = validateEnv({
  DATABASE_URL: 'postgresql://example.invalid/test',
  EMAIL_PROVIDER_MODE: 'RESEND_TEST',
  OUTREACH_TEST_DISPATCH_ENABLED: 'true',
  RESEND_API_KEY: 're_synthetic_test_key',
  RESEND_WEBHOOK_SECRET: WEBHOOK_SECRET,
  EMAIL_FROM_ADDRESS: 'sandbox@example.com',
});

function signWebhook(payload: string, id: string, at = new Date()) {
  const timestamp = Math.floor(at.getTime() / 1_000).toString();
  const signature = createHmac('sha256', webhookSecretBytes)
    .update(`${id}.${timestamp}.${payload}`)
    .digest('base64');
  return {
    'content-type': 'application/json',
    'svix-id': id,
    'svix-timestamp': timestamp,
    'svix-signature': `v1,${signature}`,
  };
}

async function createApprovedFixture(label: string) {
  const slug = `${label}-${RUN_ID}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  const company = await prisma.company.create({
    data: {
      name: `${label} ${RUN_ID}`,
      normalizedName: `${label} ${RUN_ID}`.toUpperCase(),
      domain: `${slug}.example.com`,
      country: 'TR',
      sector: 'Manufacturing',
      confidence: 1,
    },
  });
  for (const suffix of ['a', 'b']) {
    await prisma.evidence.create({
      data: {
        companyId: company.id,
        sourceUrl: `https://${slug}.example.com/evidence/${suffix}`,
        sourceName: 'Synthetic email sandbox source',
        accessedAt: new Date(),
        observedAt: new Date(),
        claimKey: `email-sandbox.${label}.${suffix}`,
        freshnessStatus: 'CURRENT',
        summary: `Synthetic email sandbox evidence ${suffix}`,
        confidence: 1,
      },
    });
  }
  const rawEmail = `${slug}@example.com`;
  const point = await createContactPoint({
    companyId: company.id,
    type: 'EMAIL',
    classification: 'COMPANY_GENERAL',
    value: rawEmail,
    countryCode: 'TR',
    sourceUrl: `https://${slug}.example.com/contact`,
    sourceName: 'Synthetic public contact page',
    sourceIsPublic: true,
    collectedAt: new Date(),
    confidence: 0.95,
    collectionPurpose: 'Email sandbox integration test',
    dataProcessingBasis: 'NOT_PERSONAL_DATA',
    noticeStatus: 'NOT_REQUIRED',
    actor: 'email-sandbox-contact-researcher',
  });
  await verifyContactPoint({
    contactPointId: point.id,
    status: 'VERIFIED',
    confidence: 0.95,
    reason: 'Human reviewer verified this synthetic address.',
    verifiedBy: 'email-sandbox-contact-reviewer',
  });
  await recordCommunicationPermission({
    contactPointId: point.id,
    channel: 'EMAIL',
    purpose: 'SALES_OUTREACH',
    jurisdictionCountry: 'TR',
    status: 'ALLOWED',
    dataProcessingBasis: 'NOT_PERSONAL_DATA',
    communicationRule: 'B2B_RECIPIENT_EXCEPTION',
    recipientCategory: 'TRADER_OR_CRAFTSMAN',
    evidenceUrl: `https://${slug}.example.com/policy`,
    policyVersion: POLICY_VERSION,
    checkedAt: new Date(),
    reviewedBy: 'email-sandbox-policy-reviewer',
    reason: 'Synthetic human-reviewed permission receipt.',
  });
  const ranking = await recordCompanyRanking(company.id, {
    companyIds: [company.id],
    targetCountries: ['TR'],
    targetSectors: ['Manufacturing'],
    channel: 'EMAIL',
    purpose: 'SALES_OUTREACH',
    jurisdictionCountry: 'TR',
    policyVersion: 'icp-policy-email-sandbox-v1',
    evaluatedAt: new Date(),
    createdBy: 'email-sandbox-ranking-reviewer',
  });
  const draft = await createOutreachDraft({
    companyId: company.id,
    contactPointId: point.id,
    rankingReceiptId: ranking.id,
    purpose: 'SALES_OUTREACH',
    jurisdictionCountry: 'TR',
    policyVersion: POLICY_VERSION,
    templateKey: 'provider-sandbox-probe',
    templateVersion: 'v1',
    subject: 'Synthetic approved customer draft',
    body: 'This customer content must never be sent to the provider sandbox.',
    author: 'email-sandbox-content-author',
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000),
  });
  await submitOutreachDraftForReview({
    draftId: draft.id,
    submittedBy: 'email-sandbox-review-coordinator',
  });
  await decideOutreachDraft({
    draftId: draft.id,
    expectedRevisionNumber: 1,
    decision: 'APPROVED',
    decisionReason: 'Independent reviewer approved the synthetic draft and policy receipt.',
    reviewedBy: 'email-sandbox-independent-approver',
  });
  return { company, point, draft };
}

function fakeDispatchService(providerMessageId: string) {
  const implementation: FetchImplementation = async () =>
    new Response(JSON.stringify({ id: providerMessageId }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  const fetchImpl = vi.fn(implementation);
  return {
    service: createEmailSandboxDispatchService(DISPATCH_ENV, { fetchImpl }),
    fetchImpl,
  };
}

async function prepare(label: string, scenario: 'DELIVERED' | 'BOUNCED' = 'DELIVERED') {
  const fixture = await createApprovedFixture(label);
  const safeLabel = label.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  const attempt = await prepareSandboxSendAttempt({
    draftId: fixture.draft.id,
    scenario,
    idempotencyKey: `${RUN_ID}:${safeLabel}:${scenario}`,
    requestedBy: 'email-sandbox-operator',
  });
  return { fixture, attempt };
}

beforeAll(async () => {
  previousWebhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  process.env.RESEND_WEBHOOK_SECRET = WEBHOOK_SECRET;
  server = buildServer().server;
  await prisma.$connect();
});

afterAll(async () => {
  await server.close();
  await prisma.$disconnect();
  if (previousWebhookSecret === undefined) delete process.env.RESEND_WEBHOOK_SECRET;
  else process.env.RESEND_WEBHOOK_SECRET = previousWebhookSecret;
});

describe('Phase 5 email provider safety boundary', () => {
  it('keeps provider execution disabled by default and requires complete explicit test configuration', () => {
    const defaults = validateEnv({ DATABASE_URL: 'postgresql://example.invalid/test' });
    expect(defaults.EMAIL_PROVIDER_MODE).toBe('DISABLED');
    expect(defaults.OUTREACH_TEST_DISPATCH_ENABLED).toBe(false);
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(() =>
        validateEnv({
          DATABASE_URL: 'postgresql://example.invalid/test',
          EMAIL_PROVIDER_MODE: 'RESEND_TEST',
          OUTREACH_TEST_DISPATCH_ENABLED: 'true',
        })
      ).toThrow('Environment validation failed');
    } finally {
      errorLog.mockRestore();
    }
  });

  it('submits only fixed Resend simulation content with the caller idempotency key', async () => {
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body)) as {
        to: string[];
        subject: string;
        text: string;
        tags: Array<{ name: string; value: string }>;
      };
      expect(payload.to).toEqual([resolveSandboxRecipient('DELIVERED')]);
      expect(payload.subject).toBe('Koseoglu Growth sandbox DELIVERED');
      expect(payload.text).not.toContain('customer@example.com');
      expect(payload.tags).toEqual([{ name: 'send_attempt_id', value: 'attempt-1' }]);
      expect(new Headers(init?.headers).get('idempotency-key')).toBe('provider-idempotency-1');
      return new Response(JSON.stringify({ id: 'msg_provider_adapter_1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    const provider = createResendTestProvider({
      apiKey: 're_synthetic_test_key',
      fromAddress: 'sandbox@example.com',
      fetchImpl,
    });
    await expect(
      provider.dispatch({
        sendAttemptId: 'attempt-1',
        idempotencyKey: 'provider-idempotency-1',
        scenario: 'DELIVERED',
      })
    ).resolves.toEqual({ providerMessageId: 'msg_provider_adapter_1' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('classifies a network failure as an unknown provider outcome', async () => {
    const provider = createResendTestProvider({
      apiKey: 're_synthetic_test_key',
      fromAddress: 'sandbox@example.com',
      fetchImpl: vi.fn(async () => {
        throw new Error('synthetic network failure');
      }),
    });
    await expect(
      provider.dispatch({
        sendAttemptId: 'attempt-network',
        idempotencyKey: 'provider-idempotency-network',
        scenario: 'DELIVERED',
      })
    ).rejects.toMatchObject({
      outcome: 'UNKNOWN',
      code: 'PROVIDER_TRANSPORT_OUTCOME_UNKNOWN',
    });
  });

  it('distinguishes permanent and retryable Resend idempotency conflicts', async () => {
    const input = {
      sendAttemptId: 'attempt-conflict',
      idempotencyKey: 'provider-idempotency-conflict',
      scenario: 'DELIVERED' as const,
    };
    const permanent = createResendTestProvider({
      apiKey: 're_synthetic_test_key',
      fromAddress: 'sandbox@example.com',
      fetchImpl: vi.fn(
        async () =>
          new Response(JSON.stringify({ name: 'invalid_idempotent_request' }), {
            status: 409,
            headers: { 'content-type': 'application/json' },
          })
      ),
    });
    await expect(permanent.dispatch(input)).rejects.toMatchObject({
      outcome: 'DEFINITE_FAILURE',
      code: 'PROVIDER_IDEMPOTENCY_PAYLOAD_MISMATCH',
    });

    const concurrent = createResendTestProvider({
      apiKey: 're_synthetic_test_key',
      fromAddress: 'sandbox@example.com',
      fetchImpl: vi.fn(
        async () =>
          new Response(JSON.stringify({ name: 'concurrent_idempotent_requests' }), {
            status: 409,
            headers: { 'content-type': 'application/json' },
          })
      ),
    });
    await expect(concurrent.dispatch(input)).rejects.toMatchObject({
      outcome: 'UNKNOWN',
      code: 'PROVIDER_IDEMPOTENCY_CONCURRENT',
    });
  });

  it('verifies the exact raw Svix payload and rejects tampering or stale timestamps', () => {
    const payload = JSON.stringify({ type: 'email.delivered', data: { email_id: 'msg_1' } });
    const id = `evt_${RUN_ID}_signature`;
    const headers = signWebhook(payload, id);
    expect(
      verifySvixWebhook({
        payload,
        headers: {
          id: headers['svix-id'],
          timestamp: headers['svix-timestamp'],
          signature: headers['svix-signature'],
        },
        secret: WEBHOOK_SECRET,
      })
    ).toEqual(expect.objectContaining({ providerEventId: id }));
    expect(() =>
      verifySvixWebhook({
        payload: `${payload} `,
        headers: {
          id: headers['svix-id'],
          timestamp: headers['svix-timestamp'],
          signature: headers['svix-signature'],
        },
        secret: WEBHOOK_SECRET,
      })
    ).toThrow('Invalid webhook signature');
    const staleHeaders = signWebhook(payload, id, new Date(Date.now() - 10 * 60 * 1_000));
    expect(() =>
      verifySvixWebhook({
        payload,
        headers: {
          id: staleHeaders['svix-id'],
          timestamp: staleHeaders['svix-timestamp'],
          signature: staleHeaders['svix-signature'],
        },
        secret: WEBHOOK_SECRET,
      })
    ).toThrow('Webhook timestamp is outside the accepted window');
  });

  it('prepares idempotently without a provider call and rejects key reuse with different input', async () => {
    const fixture = await createApprovedFixture('Prepare Idempotency');
    const input = {
      draftId: fixture.draft.id,
      scenario: 'DELIVERED' as const,
      idempotencyKey: `${RUN_ID}:prepare-idempotency`,
      requestedBy: 'email-sandbox-operator',
    };
    const first = await prepareSandboxSendAttempt(input);
    const duplicate = await prepareSandboxSendAttempt(input);
    expect(duplicate.id).toBe(first.id);
    expect(first).toEqual(
      expect.objectContaining({
        status: 'PREPARED',
        providerCallPerformed: false,
        testMessageSubmitted: false,
        customerMessageSubmitted: false,
      })
    );
    expect(first.approvedRecipientHash).not.toBe(first.recipientHash);
    await expect(
      prepareSandboxSendAttempt({ ...input, scenario: 'BOUNCED' })
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(prisma.sendAttempt.delete({ where: { id: first.id } })).rejects.toThrow();
    await expect(
      prisma.sendAttempt.create({
        data: {
          draftId: first.draftId,
          approvalId: first.approvalId,
          revisionId: first.revisionId,
          contactPointId: first.contactPointId,
          permissionId: first.permissionId,
          scenario: first.scenario,
          idempotencyKey: `${RUN_ID}:forged-accepted-insert`,
          payloadHash: first.payloadHash,
          contentHash: first.contentHash,
          approvedRecipientHash: first.approvedRecipientHash,
          recipientHash: first.recipientHash,
          gateReceipt: JSON.parse(JSON.stringify(first.gateReceipt)),
          status: 'ACCEPTED',
          providerMessageId: `msg_${RUN_ID}_forged_insert`,
          attemptCount: 1,
          providerCallPerformed: true,
          testMessageSubmitted: true,
          requestedBy: 'email-sandbox-db-regression',
          preparedAt: first.preparedAt,
          expiresAt: first.expiresAt,
          providerAcceptedAt: new Date(),
        },
      })
    ).rejects.toThrow('SendAttempt must be inserted in the canonical PREPARED state');
    await expect(
      prisma.sendAttempt.create({
        data: {
          draftId: first.draftId,
          approvalId: first.approvalId,
          revisionId: first.revisionId,
          contactPointId: first.contactPointId,
          permissionId: first.permissionId,
          scenario: first.scenario,
          idempotencyKey: `${RUN_ID}:null-prepared-insert`,
          payloadHash: first.payloadHash,
          contentHash: first.contentHash,
          approvedRecipientHash: first.approvedRecipientHash,
          recipientHash: first.recipientHash,
          gateReceipt: JSON.parse(JSON.stringify(first.gateReceipt)),
          testMessageSubmitted: null,
          requestedBy: 'email-sandbox-db-regression',
          preparedAt: first.preparedAt,
          expiresAt: first.expiresAt,
        },
      })
    ).rejects.toThrow('SendAttempt must be inserted in the canonical PREPARED state');
    await expect(
      prisma.sendAttempt.update({
        where: { id: first.id },
        data: {
          status: 'DISPATCHING',
          providerPayloadHash: 'b'.repeat(64),
          attemptCount: { increment: 1 },
          dispatchStartedAt: new Date(),
          testMessageSubmitted: null,
        },
      })
    ).rejects.toThrow();
  });

  it('converges concurrent identical prepare requests to one receipt', async () => {
    const fixture = await createApprovedFixture('Concurrent Prepare');
    const input = {
      draftId: fixture.draft.id,
      scenario: 'DELIVERED' as const,
      idempotencyKey: `${RUN_ID}:concurrent-prepare`,
      requestedBy: 'email-sandbox-operator',
    };
    const attempts = await Promise.all(
      Array.from({ length: 4 }, () => prepareSandboxSendAttempt(input))
    );
    expect(new Set(attempts.map((attempt) => attempt.id)).size).toBe(1);
  });

  it('rejects a direct cross-contact and cross-permission provenance receipt', async () => {
    const { attempt } = await prepare('Provenance Chain A');
    const other = await createApprovedFixture('Provenance Chain B');
    const otherApproval = await prisma.outreachApproval.findUniqueOrThrow({
      where: { draftId: other.draft.id },
    });
    expect(otherApproval.permissionId).toBeTruthy();
    await expect(
      prisma.sendAttempt.create({
        data: {
          draftId: attempt.draftId,
          approvalId: attempt.approvalId,
          revisionId: attempt.revisionId,
          contactPointId: other.point.id,
          permissionId: otherApproval.permissionId!,
          scenario: 'DELIVERED',
          idempotencyKey: `${RUN_ID}:cross-provenance`,
          payloadHash: 'a'.repeat(64),
          contentHash: attempt.contentHash,
          approvedRecipientHash: attempt.approvedRecipientHash,
          recipientHash: buildRecipientHash('EMAIL', resolveSandboxRecipient('DELIVERED')),
          gateReceipt: {
            decision: 'ALLOW',
            rawRecipientStored: false,
            customerMessageSubmitted: false,
          },
          requestedBy: 'email-sandbox-db-regression',
          expiresAt: attempt.expiresAt,
        },
      })
    ).rejects.toThrow();
  });

  it('requires the execution gate, dispatches a test attempt once, and has no public dispatch route', async () => {
    const { attempt } = await prepare('Dispatch Once');
    const disabledFetch = vi.fn();
    expect(() =>
      createEmailSandboxDispatchService(
        validateEnv({ DATABASE_URL: 'postgresql://example.invalid/test' }),
        { fetchImpl: disabledFetch }
      )
    ).toThrow('Sandbox provider execution is disabled');
    expect(disabledFetch).not.toHaveBeenCalled();

    const fake = fakeDispatchService(`msg_${RUN_ID}_dispatch_once`);
    const accepted = await fake.service.dispatch({
      sendAttemptId: attempt.id,
    });
    expect(accepted).toEqual(
      expect.objectContaining({
        status: 'ACCEPTED',
        providerCallPerformed: true,
        testMessageSubmitted: true,
        customerMessageSubmitted: false,
      })
    );
    const duplicate = await fake.service.dispatch({
      sendAttemptId: attempt.id,
    });
    expect(duplicate.status).toBe('ACCEPTED');
    expect(fake.fetchImpl).toHaveBeenCalledTimes(1);
    await expect(
      prisma.sendAttempt.update({
        where: { id: attempt.id },
        data: { providerMessageId: `msg_${RUN_ID}_receipt_rewrite` },
      })
    ).rejects.toThrow();

    const publicDispatch = await server.inject({
      method: 'POST',
      url: `/api/send-attempts/${attempt.id}/dispatch`,
      payload: {},
    });
    expect(publicDispatch.statusCode).toBe(404);
  });

  it('rechecks current permission immediately before provider dispatch', async () => {
    const { fixture, attempt } = await prepare('Dispatch Gate Recheck');
    await recordCommunicationPermission({
      contactPointId: fixture.point.id,
      channel: 'EMAIL',
      purpose: 'SALES_OUTREACH',
      jurisdictionCountry: 'TR',
      status: 'OPTED_OUT',
      dataProcessingBasis: 'NOT_PERSONAL_DATA',
      communicationRule: 'OTHER_REVIEWED',
      recipientCategory: 'LEGAL_ENTITY',
      evidenceUrl: `https://${RUN_ID}.example.com/opt-out`,
      policyVersion: POLICY_VERSION,
      checkedAt: new Date(),
      reviewedBy: 'email-sandbox-opt-out-reviewer',
      reason: 'Synthetic opt-out after preparation.',
    });
    const fake = fakeDispatchService(`msg_${RUN_ID}_must_not_send`);
    await expect(
      fake.service.dispatch({
        sendAttemptId: attempt.id,
      })
    ).rejects.toThrow('Communication gate denied');
    expect(fake.fetchImpl).not.toHaveBeenCalled();
    expect((await prisma.sendAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).status).toBe(
      'PREPARED'
    );
  });

  it('persists an unknown transport outcome and retries with the same idempotency key', async () => {
    const { attempt } = await prepare('Unknown Retry');
    const unknownImplementation: FetchImplementation = async () => {
      throw new Error('synthetic transport failure');
    };
    const unknownFetch = vi.fn(unknownImplementation);
    const unknownService = createEmailSandboxDispatchService(DISPATCH_ENV, {
      fetchImpl: unknownFetch,
    });
    const unknown = await unknownService.dispatch({
      sendAttemptId: attempt.id,
    });
    expect(unknown).toEqual(
      expect.objectContaining({
        status: 'UNKNOWN',
        attemptCount: 1,
        providerCallPerformed: true,
        testMessageSubmitted: null,
        customerMessageSubmitted: false,
        failureCode: 'PROVIDER_TRANSPORT_OUTCOME_UNKNOWN',
      })
    );
    expect(unknown.providerPayloadHash).toMatch(/^[0-9a-f]{64}$/);

    const changedPayloadFetch = vi.fn();
    const changedPayloadService = createEmailSandboxDispatchService(
      { ...DISPATCH_ENV, EMAIL_FROM_ADDRESS: 'changed-sandbox@example.com' },
      { fetchImpl: changedPayloadFetch }
    );
    await expect(
      changedPayloadService.dispatch({ sendAttemptId: attempt.id })
    ).rejects.toMatchObject({
      statusCode: 409,
      message: 'Provider payload changed for an existing idempotency key',
    });
    expect(changedPayloadFetch).not.toHaveBeenCalled();

    const retry = fakeDispatchService(`msg_${RUN_ID}_unknown_retry`);
    const accepted = await retry.service.dispatch({
      sendAttemptId: attempt.id,
    });
    expect(accepted).toEqual(
      expect.objectContaining({
        status: 'ACCEPTED',
        attemptCount: 2,
        testMessageSubmitted: true,
        customerMessageSubmitted: false,
      })
    );
    expect(new Headers(unknownFetch.mock.calls[0][1]?.headers).get('idempotency-key')).toBe(
      attempt.idempotencyKey
    );
    expect(new Headers(retry.fetchImpl.mock.calls[0][1]?.headers).get('idempotency-key')).toBe(
      attempt.idempotencyKey
    );
  });

  it('recovers a stale dispatch lease and accepts a late matching provider result', async () => {
    const { attempt } = await prepare('Stale Dispatch Recovery');
    let resolveFetch!: (response: Response) => void;
    const deferredImplementation: FetchImplementation = () =>
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      });
    const fetchImpl = vi.fn(deferredImplementation);
    const service = createEmailSandboxDispatchService(DISPATCH_ENV, { fetchImpl });
    const dispatchPromise = service.dispatch({ sendAttemptId: attempt.id });
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    const dispatching = await prisma.sendAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
    const recovered = await recoverStaleSandboxDispatch({
      sendAttemptId: attempt.id,
      recoveredBy: 'email-sandbox-recovery-worker',
      evaluatedAt: new Date(
        dispatching.dispatchStartedAt!.getTime() + (STALE_DISPATCH_LEASE_MINUTES + 1) * 60 * 1_000
      ),
    });
    expect(recovered.status).toBe('UNKNOWN');
    resolveFetch(
      new Response(JSON.stringify({ id: `msg_${RUN_ID}_stale_recovery` }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    await expect(dispatchPromise).resolves.toEqual(
      expect.objectContaining({ status: 'ACCEPTED', testMessageSubmitted: true })
    );
  });

  it('correlates a signed webhook that arrives before the provider response is committed', async () => {
    const { attempt } = await prepare('In Flight Webhook');
    const providerMessageId = `msg_${RUN_ID}_in_flight_webhook`;
    let resolveFetch!: (response: Response) => void;
    const deferredImplementation: FetchImplementation = () =>
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      });
    const fetchImpl = vi.fn(deferredImplementation);
    const service = createEmailSandboxDispatchService(DISPATCH_ENV, { fetchImpl });
    const dispatchPromise = service.dispatch({ sendAttemptId: attempt.id });
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));

    const eventId = `evt_${RUN_ID}_in_flight_webhook`;
    const foreignPayload = JSON.stringify({
      type: 'email.delivered',
      created_at: new Date().toISOString(),
      data: {
        email_id: `msg_${RUN_ID}_foreign_webhook`,
        to: [resolveSandboxRecipient('BOUNCED')],
        tags: { send_attempt_id: attempt.id },
      },
    });
    const foreignEventId = `${eventId}_foreign`;
    const foreignWebhook = await server.inject({
      method: 'POST',
      url: '/api/webhooks/resend',
      headers: signWebhook(foreignPayload, foreignEventId),
      payload: foreignPayload,
    });
    expect(foreignWebhook.statusCode).toBe(409);
    expect(
      await prisma.providerWebhookReceipt.count({ where: { providerEventId: foreignEventId } })
    ).toBe(0);
    expect((await prisma.sendAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).status).toBe(
      'DISPATCHING'
    );

    const payload = JSON.stringify({
      type: 'email.delivered',
      created_at: new Date().toISOString(),
      data: {
        email_id: providerMessageId,
        to: [resolveSandboxRecipient(attempt.scenario)],
        tags: { send_attempt_id: attempt.id },
      },
    });
    const webhook = await server.inject({
      method: 'POST',
      url: '/api/webhooks/resend',
      headers: signWebhook(payload, eventId),
      payload,
    });
    expect(webhook.statusCode).toBe(200);
    expect(webhook.json()).toEqual({ received: true, status: 'processed' });

    resolveFetch(
      new Response(JSON.stringify({ id: providerMessageId }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    await expect(dispatchPromise).resolves.toEqual(
      expect.objectContaining({ status: 'DELIVERED' })
    );
    expect(await prisma.deliveryEvent.count({ where: { sendAttemptId: attempt.id } })).toBe(1);
    const replay = await server.inject({
      method: 'POST',
      url: '/api/webhooks/resend',
      headers: signWebhook(payload, eventId),
      payload,
    });
    expect(replay.json()).toEqual({ received: true, status: 'duplicate' });
  });

  it('records a signed delivery webhook once and rejects event-id content substitution', async () => {
    const { attempt } = await prepare('Signed Delivery');
    const providerMessageId = `msg_${RUN_ID}_signed_delivery`;
    await fakeDispatchService(providerMessageId).service.dispatch({
      sendAttemptId: attempt.id,
    });
    const eventId = `evt_${RUN_ID}_signed_delivery`;
    const payload = JSON.stringify({
      type: 'email.delivered',
      created_at: new Date().toISOString(),
      data: {
        email_id: providerMessageId,
        to: [resolveSandboxRecipient(attempt.scenario)],
      },
    });
    const first = await server.inject({
      method: 'POST',
      url: '/api/webhooks/resend',
      headers: signWebhook(payload, eventId),
      payload,
    });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ received: true, status: 'processed' });
    const duplicate = await server.inject({
      method: 'POST',
      url: '/api/webhooks/resend',
      headers: signWebhook(payload, eventId),
      payload,
    });
    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json()).toEqual({ received: true, status: 'duplicate' });
    expect(await prisma.deliveryEvent.count({ where: { sendAttemptId: attempt.id } })).toBe(1);
    const deliveryReceipt = await prisma.deliveryEvent.findFirstOrThrow({
      where: { sendAttemptId: attempt.id },
    });
    await expect(
      prisma.deliveryEvent.delete({ where: { id: deliveryReceipt.id } })
    ).rejects.toThrow();
    expect((await prisma.sendAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).status).toBe(
      'DELIVERED'
    );

    const substituted = JSON.stringify({
      type: 'email.bounced',
      created_at: new Date().toISOString(),
      data: {
        email_id: providerMessageId,
        to: [resolveSandboxRecipient(attempt.scenario)],
      },
    });
    const conflict = await server.inject({
      method: 'POST',
      url: '/api/webhooks/resend',
      headers: signWebhook(substituted, eventId),
      payload: substituted,
    });
    expect(conflict.statusCode).toBe(409);
  });

  it('suppresses only the provider test recipient after a signed bounce', async () => {
    const { fixture, attempt } = await prepare('Signed Bounce', 'BOUNCED');
    const providerMessageId = `msg_${RUN_ID}_signed_bounce`;
    await fakeDispatchService(providerMessageId).service.dispatch({
      sendAttemptId: attempt.id,
    });
    const eventId = `evt_${RUN_ID}_signed_bounce`;
    const payload = JSON.stringify({
      type: 'email.bounced',
      created_at: new Date().toISOString(),
      data: {
        email_id: providerMessageId,
        to: [resolveSandboxRecipient(attempt.scenario)],
      },
    });
    const response = await server.inject({
      method: 'POST',
      url: '/api/webhooks/resend',
      headers: signWebhook(payload, eventId),
      payload,
    });
    expect(response.statusCode).toBe(200);
    expect(
      await prisma.suppressionEntry.count({
        where: { channel: 'EMAIL', recipientHash: attempt.recipientHash },
      })
    ).toBe(1);
    expect(
      await prisma.suppressionEntry.count({
        where: {
          channel: 'EMAIL',
          recipientHash: buildRecipientHash('EMAIL', fixture.point.normalizedValue),
        },
      })
    ).toBe(0);
  });

  it('ignores inbound mail without creating an append-only receipt', async () => {
    const eventId = `evt_${RUN_ID}_received`;
    const rawFrom = 'reply-sender@example.com';
    const rawTo = 'inbound@example.com';
    const rawSubject = 'Sensitive reply subject';
    const rawMessageId = '<sensitive-message-id@example.com>';
    const payload = JSON.stringify({
      type: 'email.received',
      created_at: new Date().toISOString(),
      data: {
        email_id: `msg_${RUN_ID}_received`,
        from: rawFrom,
        to: [rawTo],
        subject: rawSubject,
        message_id: rawMessageId,
        attachments: [],
      },
    });
    const receiptCountBefore = await prisma.providerWebhookReceipt.count();
    const replyCountBefore = await prisma.reply.count();
    const invalid = await server.inject({
      method: 'POST',
      url: '/api/webhooks/resend',
      headers: {
        ...signWebhook(payload, eventId),
        'svix-signature': 'v1,invalid',
      },
      payload,
    });
    expect(invalid.statusCode).toBe(400);
    expect(await prisma.providerWebhookReceipt.count({ where: { providerEventId: eventId } })).toBe(
      0
    );

    const valid = await server.inject({
      method: 'POST',
      url: '/api/webhooks/resend',
      headers: signWebhook(payload, eventId),
      payload,
    });
    expect(valid.statusCode).toBe(200);
    expect(valid.json()).toEqual({ received: true, status: 'ignored' });
    expect(await prisma.providerWebhookReceipt.count()).toBe(receiptCountBefore);
    expect(await prisma.reply.count()).toBe(replyCountBefore);
  });

  it('protects webhook and reply receipt rows from update and delete', async () => {
    const rawFrom = 'reply-sender@example.com';
    const rawTo = 'inbound@example.com';
    const rawSubject = 'Sensitive reply subject';
    const rawMessageId = '<sensitive-message-id@example.com>';
    const receipt = await prisma.providerWebhookReceipt.create({
      data: {
        provider: 'RESEND',
        providerEventId: `evt_${RUN_ID}_append_only_guard`,
        eventType: 'email.synthetic_guard',
        payloadHash: sha256('synthetic append-only fixture'),
        providerCreatedAt: new Date(),
        receivedAt: new Date(),
        outcome: 'IGNORED',
      },
    });
    await expect(
      prisma.providerWebhookReceipt.update({
        where: { id: receipt.id },
        data: { outcome: 'IGNORED' },
      })
    ).rejects.toThrow();
    await expect(
      prisma.providerWebhookReceipt.delete({ where: { id: receipt.id } })
    ).rejects.toThrow();

    const reply = await prisma.reply.create({
      data: {
        webhookReceiptId: receipt.id,
        providerEmailId: `manual_${RUN_ID}_reply_receipt`,
        messageIdHash: sha256(rawMessageId),
        senderHash: sha256(rawFrom),
        recipientHash: sha256(rawTo),
        subjectHash: sha256(rawSubject),
        receipt: {
          rawPayloadStored: false,
          rawAddressesStored: false,
          bodyRetrieved: false,
          fixtureOnly: true,
        },
        receivedAt: new Date(),
      },
    });
    await expect(prisma.reply.delete({ where: { id: reply.id } })).rejects.toThrow();
  });
});
