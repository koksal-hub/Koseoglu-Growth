import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/index';
import {
  buildRecipientHash,
  createContactPoint,
  recordCommunicationPermission,
  verifyContactPoint,
} from '../src/lib/contact-points';
import { prisma } from '../src/lib/prisma';
import { recordCompanyRanking } from '../src/lib/ranking';

const RUN_ID = `outreach-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const POLICY_VERSION = 'communication-policy-test-v1';
const companyIds: string[] = [];
const contactPointIds: string[] = [];
const evidenceIds: string[] = [];
const rankingReceiptIds: string[] = [];
const draftIds: string[] = [];
const suppressionHashes: string[] = [];
let server: FastifyInstance;

function payload<T>(response: { payload: string }): T {
  return JSON.parse(response.payload) as T;
}

async function createCompany(label: string) {
  const company = await prisma.company.create({
    data: {
      name: `${label} ${RUN_ID}`,
      normalizedName: `${label} ${RUN_ID}`.toUpperCase(),
      domain: `${label.toLowerCase().replace(/\s+/g, '-')}-${RUN_ID}.example.com`,
      country: 'TR',
      sector: 'Manufacturing',
      confidence: 1,
    },
  });
  companyIds.push(company.id);
  return company;
}

async function addEvidence(companyId: string, label: string) {
  const evidence = await prisma.evidence.create({
    data: {
      companyId,
      sourceUrl: `https://${RUN_ID}.example.com/evidence/${label}`,
      sourceName: 'Synthetic outreach source',
      accessedAt: new Date(),
      observedAt: new Date(),
      claimKey: `outreach.${label}`,
      freshnessStatus: 'CURRENT',
      summary: `Synthetic outreach evidence ${label}`,
      confidence: 1,
    },
  });
  evidenceIds.push(evidence.id);
}

async function addAllowedEmail(companyId: string, label: string) {
  const localLabel = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const rawEmail = `${localLabel}-${RUN_ID}@example.com`;
  const point = await createContactPoint({
    companyId,
    type: 'EMAIL',
    classification: 'COMPANY_GENERAL',
    value: rawEmail,
    countryCode: 'TR',
    sourceUrl: `https://${RUN_ID}.example.com/contact/${label}`,
    sourceName: 'Synthetic public contact page',
    sourceIsPublic: true,
    collectedAt: new Date(),
    confidence: 0.95,
    collectionPurpose: 'Outreach draft integration test',
    dataProcessingBasis: 'NOT_PERSONAL_DATA',
    noticeStatus: 'NOT_REQUIRED',
    actor: 'outreach-test',
  });
  contactPointIds.push(point.id);
  suppressionHashes.push(buildRecipientHash('EMAIL', point.normalizedValue));
  await verifyContactPoint({
    contactPointId: point.id,
    status: 'VERIFIED',
    confidence: 0.95,
    reason: 'Human reviewer verified this synthetic address.',
    verifiedBy: 'outreach-contact-reviewer',
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
    evidenceUrl: `https://${RUN_ID}.example.com/policy/${label}`,
    policyVersion: POLICY_VERSION,
    checkedAt: new Date(),
    reviewedBy: 'outreach-policy-reviewer',
    reason: 'Synthetic human-reviewed permission receipt.',
  });
  return { point, rawEmail };
}

async function rankCompany(companyId: string, evaluatedAt = new Date()) {
  const receipt = await recordCompanyRanking(companyId, {
    companyIds: [companyId],
    targetCountries: ['TR'],
    targetSectors: ['Manufacturing'],
    channel: 'EMAIL',
    purpose: 'SALES_OUTREACH',
    jurisdictionCountry: 'TR',
    policyVersion: 'icp-policy-outreach-test-v1',
    evaluatedAt,
    createdBy: 'outreach-ranking-reviewer',
  });
  rankingReceiptIds.push(receipt.id);
  return receipt;
}

async function createFixture(label: string, withEvidence = true) {
  const company = await createCompany(label);
  if (withEvidence) {
    await addEvidence(company.id, `${label}-a`);
    await addEvidence(company.id, `${label}-b`);
  }
  const { point, rawEmail } = await addAllowedEmail(company.id, label);
  const ranking = await rankCompany(company.id);
  return { company, point, ranking, rawEmail };
}

function draftBody(contactPointId: string, rankingReceiptId: string, author = 'draft-author') {
  return {
    contactPointId,
    rankingReceiptId,
    purpose: 'SALES_OUTREACH',
    jurisdictionCountry: 'TR',
    policyVersion: POLICY_VERSION,
    templateKey: 'first-touch-logistics',
    templateVersion: 'v1',
    subject: 'Lojistik iş birliği görüşmesi',
    body: 'Köseoğlu Lojistik hizmetlerini değerlendirmek üzere bir görüşme öneriyoruz.',
    author,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };
}

async function createDraft(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  author = 'draft-author'
) {
  const response = await server.inject({
    method: 'POST',
    url: `/api/companies/${fixture.company.id}/outreach-drafts`,
    payload: draftBody(fixture.point.id, fixture.ranking.id, author),
  });
  if (response.statusCode === 201) {
    const draft = payload<{ id: string }>(response);
    draftIds.push(draft.id);
  }
  return response;
}

async function submitDraft(draftId: string, submittedBy = 'review-coordinator') {
  return server.inject({
    method: 'POST',
    url: `/api/outreach-drafts/${draftId}/submit-review`,
    payload: { submittedBy },
  });
}

beforeAll(async () => {
  server = buildServer().server;
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.outreachApproval.deleteMany({ where: { draftId: { in: draftIds } } });
  await prisma.outreachDraftRevision.deleteMany({ where: { draftId: { in: draftIds } } });
  await prisma.outreachDraft.deleteMany({ where: { id: { in: draftIds } } });
  await prisma.companyRankingReceipt.deleteMany({ where: { id: { in: rankingReceiptIds } } });
  await prisma.communicationPermission.deleteMany({
    where: { contactPointId: { in: contactPointIds } },
  });
  await prisma.suppressionEntry.deleteMany({ where: { recipientHash: { in: suppressionHashes } } });
  await prisma.event.deleteMany({
    where: {
      OR: [
        { entityType: 'OutreachDraft', entityId: { in: draftIds } },
        { entityId: { in: [...companyIds, ...contactPointIds] } },
      ],
    },
  });
  await prisma.contactPoint.deleteMany({ where: { id: { in: contactPointIds } } });
  await prisma.evidence.deleteMany({ where: { id: { in: evidenceIds } } });
  await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
  await server.close();
  await prisma.$disconnect();
});

describe('Outreach draft and independent human approval API', () => {
  it('creates a human-authored draft from the latest ready receipt without exposing or sending the recipient', async () => {
    const fixture = await createFixture('Draft Ready');
    const response = await createDraft(fixture);
    expect(response.statusCode).toBe(201);
    const draft = payload<{
      id: string;
      status: string;
      generationMethod: string;
      recipientSnapshot: { recipientHash: string; rawRecipientStored: boolean };
      revisions: Array<{ revisionNumber: number; contentHash: string }>;
      sendAuthorized: boolean;
      providerCallPerformed: boolean;
      actualSendPerformed: boolean;
    }>(response);
    expect(draft).toEqual(
      expect.objectContaining({
        status: 'DRAFT',
        generationMethod: 'HUMAN_AUTHORED',
        sendAuthorized: false,
        providerCallPerformed: false,
        actualSendPerformed: false,
      })
    );
    expect(draft.recipientSnapshot).toEqual(
      expect.objectContaining({
        recipientHash: buildRecipientHash('EMAIL', fixture.point.normalizedValue),
        rawRecipientStored: false,
      })
    );
    expect(response.payload).not.toContain(fixture.rawEmail);
    expect(draft.revisions).toEqual([
      expect.objectContaining({
        revisionNumber: 1,
        contentHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
    ]);
    expect(await prisma.lead.count({ where: { companyId: fixture.company.id } })).toBe(0);
    expect(
      await prisma.activity.count({ where: { lead: { companyId: fixture.company.id } } })
    ).toBe(0);
  });

  it('preserves immutable revision history and rejects stale or post-review edits', async () => {
    const fixture = await createFixture('Revision History');
    const created = payload<{ id: string; revisions: Array<{ contentHash: string }> }>(
      await createDraft(fixture)
    );
    const revisedResponse = await server.inject({
      method: 'POST',
      url: `/api/outreach-drafts/${created.id}/revisions`,
      payload: {
        expectedRevisionNumber: 1,
        subject: 'Güncellenmiş lojistik iş birliği görüşmesi',
        body: 'İnsan editör tarafından güncellenmiş, fiyat taahhüdü içermeyen taslak.',
        editedBy: 'second-content-author',
        editReason: 'Mesajı kısalt ve amacı netleştir.',
      },
    });
    expect(revisedResponse.statusCode).toBe(201);
    const revised = payload<{
      currentRevisionNumber: number;
      revisions: Array<{ contentHash: string }>;
    }>(revisedResponse);
    expect(revised.currentRevisionNumber).toBe(2);
    expect(revised.revisions).toHaveLength(2);
    expect(revised.revisions[1].contentHash).not.toBe(revised.revisions[0].contentHash);

    const staleEdit = await server.inject({
      method: 'POST',
      url: `/api/outreach-drafts/${created.id}/revisions`,
      payload: {
        expectedRevisionNumber: 1,
        subject: 'Stale edit',
        body: 'This write must not win.',
        editedBy: 'stale-editor',
        editReason: 'Synthetic stale write.',
      },
    });
    expect(staleEdit.statusCode).toBe(409);
    expect((await submitDraft(created.id)).statusCode).toBe(200);

    const postReviewEdit = await server.inject({
      method: 'POST',
      url: `/api/outreach-drafts/${created.id}/revisions`,
      payload: {
        expectedRevisionNumber: 2,
        subject: 'Forbidden review edit',
        body: 'Review başladıktan sonra içerik değişemez.',
        editedBy: 'late-editor',
        editReason: 'Synthetic forbidden transition.',
      },
    });
    expect(postReviewEdit.statusCode).toBe(409);
    expect(await prisma.outreachDraftRevision.count({ where: { draftId: created.id } })).toBe(2);
  });

  it('requires a reviewer independent from every content author and records approval without send authority', async () => {
    const fixture = await createFixture('Independent Approval');
    const created = payload<{ id: string }>(await createDraft(fixture, 'primary-author'));
    expect((await submitDraft(created.id)).statusCode).toBe(200);

    const selfApproval = await server.inject({
      method: 'POST',
      url: `/api/outreach-drafts/${created.id}/decisions`,
      payload: {
        expectedRevisionNumber: 1,
        decision: 'APPROVED',
        decisionReason: 'Self approval must be rejected.',
        reviewedBy: 'primary-author',
      },
    });
    expect(selfApproval.statusCode).toBe(409);

    const approvalResponse = await server.inject({
      method: 'POST',
      url: `/api/outreach-drafts/${created.id}/decisions`,
      payload: {
        expectedRevisionNumber: 1,
        decision: 'APPROVED',
        decisionReason: 'Independent human verified content and current policy receipt.',
        reviewedBy: 'independent-approver',
      },
    });
    expect(approvalResponse.statusCode).toBe(201);
    const approved = payload<{
      status: string;
      approval: {
        decision: string;
        contentHash: string;
        gateReceipt: { decision: string; actualSendPerformed: boolean };
      };
      revisions: Array<{ contentHash: string }>;
      sendAuthorized: boolean;
      providerCallPerformed: boolean;
      actualSendPerformed: boolean;
    }>(approvalResponse);
    expect(approved.status).toBe('APPROVED');
    expect(approved.approval).toEqual(
      expect.objectContaining({
        decision: 'APPROVED',
        contentHash: approved.revisions[0].contentHash,
        gateReceipt: expect.objectContaining({ decision: 'ALLOW', actualSendPerformed: false }),
      })
    );
    expect(approved.sendAuthorized).toBe(false);
    expect(approved.providerCallPerformed).toBe(false);
    expect(approved.actualSendPerformed).toBe(false);
    expect(
      await prisma.event.count({
        where: { type: 'OUTREACH_APPROVAL_RECORDED', entityId: created.id },
      })
    ).toBe(1);
    expect(await prisma.lead.count({ where: { companyId: fixture.company.id } })).toBe(0);
    await expect(
      prisma.outreachApproval.update({
        where: { draftId: created.id },
        data: { decisionReason: 'A direct DB update must not rewrite this receipt.' },
      })
    ).rejects.toThrow();
  });

  it('rechecks suppression at decision time, blocks approval, and still permits a safe rejection receipt', async () => {
    const fixture = await createFixture('Suppression Recheck');
    const created = payload<{ id: string }>(await createDraft(fixture));
    expect((await submitDraft(created.id)).statusCode).toBe(200);
    await prisma.suppressionEntry.create({
      data: {
        channel: 'EMAIL',
        recipientHash: buildRecipientHash('EMAIL', fixture.point.normalizedValue),
        reason: 'Synthetic suppression after review submission.',
        source: 'OUTREACH_TEST',
        recordedBy: 'suppression-reviewer',
      },
    });

    const blockedApproval = await server.inject({
      method: 'POST',
      url: `/api/outreach-drafts/${created.id}/decisions`,
      payload: {
        expectedRevisionNumber: 1,
        decision: 'APPROVED',
        decisionReason: 'This must be blocked by current suppression.',
        reviewedBy: 'independent-blocked-approver',
      },
    });
    expect(blockedApproval.statusCode).toBe(409);
    expect(blockedApproval.payload).toContain('GLOBAL_SUPPRESSION');
    expect(await prisma.outreachApproval.count({ where: { draftId: created.id } })).toBe(0);
    expect(
      (await prisma.outreachDraft.findUniqueOrThrow({ where: { id: created.id } })).status
    ).toBe('IN_REVIEW');

    const rejection = await server.inject({
      method: 'POST',
      url: `/api/outreach-drafts/${created.id}/decisions`,
      payload: {
        expectedRevisionNumber: 1,
        decision: 'REJECTED',
        decisionReason: 'Recipient became suppressed; reject and preserve the gate receipt.',
        reviewedBy: 'independent-rejector',
      },
    });
    expect(rejection.statusCode).toBe(201);
    const rejected = payload<{
      status: string;
      approval: { gateReceipt: { decision: string; reasons: string[] } };
    }>(rejection);
    expect(rejected.status).toBe('REJECTED');
    expect(rejected.approval.gateReceipt).toEqual(
      expect.objectContaining({
        decision: 'DENY',
        reasons: expect.arrayContaining(['GLOBAL_SUPPRESSION']),
      })
    );
  });

  it('rechecks permission at review submission and leaves a denied draft in DRAFT', async () => {
    const fixture = await createFixture('Review Gate');
    const created = payload<{ id: string }>(await createDraft(fixture));
    await recordCommunicationPermission({
      contactPointId: fixture.point.id,
      channel: 'EMAIL',
      purpose: 'SALES_OUTREACH',
      jurisdictionCountry: 'TR',
      status: 'OPTED_OUT',
      dataProcessingBasis: 'NOT_PERSONAL_DATA',
      communicationRule: 'OTHER_REVIEWED',
      recipientCategory: 'LEGAL_ENTITY',
      evidenceUrl: `https://${RUN_ID}.example.com/optout/review-gate`,
      policyVersion: POLICY_VERSION,
      checkedAt: new Date(),
      reviewedBy: 'optout-reviewer',
      reason: 'Synthetic opt-out before review submission.',
    });
    const response = await submitDraft(created.id);
    expect(response.statusCode).toBe(409);
    expect(
      (await prisma.outreachDraft.findUniqueOrThrow({ where: { id: created.id } })).status
    ).toBe('DRAFT');
  });

  it('rejects a ranking receipt that is not outreach-ready', async () => {
    const fixture = await createFixture('Not Ready Ranking', false);
    expect(fixture.ranking.nextAction).not.toBe('READY_FOR_HUMAN_OUTREACH_REVIEW');
    const response = await createDraft(fixture);
    expect(response.statusCode).toBe(409);
    expect(await prisma.outreachDraft.count({ where: { companyId: fixture.company.id } })).toBe(0);
  });

  it('rejects an older ranking receipt after a newer receipt exists', async () => {
    const fixture = await createFixture('Latest Ranking');
    const newer = await rankCompany(fixture.company.id, new Date(Date.now() + 1000));
    expect(newer.id).not.toBe(fixture.ranking.id);
    const response = await createDraft(fixture);
    expect(response.statusCode).toBe(409);
    expect(response.payload).toContain('latest company ranking receipt');
  });

  it('enforces email-only and content-hash integrity in PostgreSQL', async () => {
    const fixture = await createFixture('DB Draft Constraints');
    const created = payload<{ id: string }>(await createDraft(fixture));
    await expect(
      prisma.outreachDraftRevision.create({
        data: {
          draftId: created.id,
          revisionNumber: 2,
          subject: 'Constraint test',
          body: 'Invalid content hash must be rejected by PostgreSQL.',
          contentHash: 'a'.repeat(63),
          editedBy: 'db-test',
          editReason: 'Direct DB constraint regression.',
        },
      })
    ).rejects.toThrow();
    await expect(
      prisma.outreachDraft.update({ where: { id: created.id }, data: { channel: 'PHONE' } })
    ).rejects.toThrow();
    await expect(
      prisma.outreachDraft.update({
        where: { id: created.id },
        data: {
          recipientSnapshot: {
            recipientHash: 'a'.repeat(64),
            rawRecipientStored: true,
            normalizedValue: 'hidden@example.com',
          },
        },
      })
    ).rejects.toThrow();
    await expect(
      prisma.outreachDraft.update({ where: { id: created.id }, data: { status: 'APPROVED' } })
    ).rejects.toThrow();
    const revision = await prisma.outreachDraftRevision.findFirstOrThrow({
      where: { draftId: created.id },
    });
    await expect(
      prisma.outreachDraftRevision.update({
        where: { id: revision.id },
        data: { subject: 'A direct DB update must not rewrite this revision.' },
      })
    ).rejects.toThrow();
  });

  it('expires only an IN_REVIEW draft that reached expiresAt and keeps it terminal', async () => {
    const fixture = await createFixture('Expiry State');
    const created = payload<{ id: string }>(await createDraft(fixture));
    expect((await submitDraft(created.id)).statusCode).toBe(200);
    await prisma.outreachDraft.update({
      where: { id: created.id },
      data: { expiresAt: new Date(Date.now() + 10) },
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
    const expiredResponse = await server.inject({
      method: 'POST',
      url: `/api/outreach-drafts/${created.id}/expire`,
      payload: { expiredBy: 'expiry-reviewer' },
    });
    expect(expiredResponse.statusCode).toBe(200);
    expect(payload<{ status: string }>(expiredResponse).status).toBe('EXPIRED');

    const lateDecision = await server.inject({
      method: 'POST',
      url: `/api/outreach-drafts/${created.id}/decisions`,
      payload: {
        expectedRevisionNumber: 1,
        decision: 'APPROVED',
        decisionReason: 'Expired draft cannot be approved.',
        reviewedBy: 'late-approver',
      },
    });
    expect(lateDecision.statusCode).toBe(409);
  });

  it('bounds company draft history queries', async () => {
    const fixture = await createFixture('History Bound');
    expect((await createDraft(fixture)).statusCode).toBe(201);
    const response = await server.inject({
      method: 'GET',
      url: `/api/companies/${fixture.company.id}/outreach-drafts?limit=101`,
    });
    expect(response.statusCode).toBe(400);
  });
});
