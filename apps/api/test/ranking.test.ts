import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/index';
import {
  buildRecipientHash,
  createContactPoint,
  recordCommunicationPermission,
  verifyContactPoint
} from '../src/lib/contact-points';
import { prisma } from '../src/lib/prisma';

const RUN_ID = `ranking-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const EVALUATED_AT = new Date(Date.now() + 60_000);
const companyIds: string[] = [];
const contactPointIds: string[] = [];
const evidenceIds: string[] = [];
const suppressionHashes: string[] = [];
let server: FastifyInstance;

function payload<T>(response: { payload: string }): T {
  return JSON.parse(response.payload) as T;
}

async function createCompany(label: string, overrides: Record<string, unknown> = {}) {
  const company = await prisma.company.create({
    data: {
      name: `${label} ${RUN_ID}`,
      normalizedName: `${label} ${RUN_ID}`.toUpperCase(),
      domain: `${label.toLowerCase().replace(/\s+/g, '-')}-${RUN_ID}.example.com`,
      country: 'TR',
      sector: 'Manufacturing',
      confidence: 1,
      ...overrides
    }
  });
  companyIds.push(company.id);
  return company;
}

async function addEvidence(
  companyId: string,
  label: string,
  overrides: Record<string, unknown> = {}
) {
  const evidence = await prisma.evidence.create({
    data: {
      companyId,
      sourceUrl: `https://${RUN_ID}.example.com/evidence/${label}`,
      sourceName: 'Synthetic ranking source',
      accessedAt: new Date(),
      observedAt: new Date(),
      claimKey: `signal.${label}`,
      freshnessStatus: 'CURRENT',
      summary: `Synthetic ranking evidence ${label}`,
      confidence: 1,
      ...overrides
    }
  });
  evidenceIds.push(evidence.id);
  return evidence;
}

async function addCompanyEmail(companyId: string, label: string, allowed: boolean) {
  const point = await createContactPoint({
    companyId,
    type: 'EMAIL',
    classification: 'COMPANY_GENERAL',
    value: `${label}-${RUN_ID}@example.com`,
    countryCode: 'TR',
    sourceUrl: `https://${RUN_ID}.example.com/contact/${label}`,
    sourceName: 'Synthetic public contact page',
    sourceIsPublic: true,
    collectedAt: new Date(),
    confidence: 0.95,
    collectionPurpose: 'Ranking integration test',
    dataProcessingBasis: 'NOT_PERSONAL_DATA',
    noticeStatus: 'NOT_REQUIRED',
    actor: 'ranking-test'
  });
  contactPointIds.push(point.id);
  await verifyContactPoint({
    contactPointId: point.id,
    status: 'VERIFIED',
    confidence: 0.95,
    reason: 'Human reviewer verified this synthetic address.',
    verifiedBy: 'ranking-reviewer'
  });
  if (allowed) {
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
      policyVersion: 'communication-policy-test-v1',
      checkedAt: new Date(),
      reviewedBy: 'ranking-policy-reviewer',
      reason: 'Synthetic human-reviewed permission receipt.'
    });
  }
  return point;
}

function refreshBody(companyIdsToRank: string[], overrides: Record<string, unknown> = {}) {
  return {
    companyIds: companyIdsToRank,
    targetCountries: ['TR', 'DE'],
    targetSectors: ['Manufacturing', 'Logistics'],
    channel: 'EMAIL',
    purpose: 'SALES_OUTREACH',
    jurisdictionCountry: 'TR',
    policyVersion: 'icp-policy-test-v1',
    evaluatedAt: EVALUATED_AT.toISOString(),
    createdBy: 'ranking-test-reviewer',
    ...overrides
  };
}

async function refresh(companyIdsToRank: string[], overrides: Record<string, unknown> = {}) {
  return server.inject({
    method: 'POST',
    url: '/api/daily-actions/refresh',
    payload: refreshBody(companyIdsToRank, overrides)
  });
}

beforeAll(async () => {
  server = buildServer().server;
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.companyRankingReceipt.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.communicationPermission.deleteMany({ where: { contactPointId: { in: contactPointIds } } });
  await prisma.suppressionEntry.deleteMany({ where: { recipientHash: { in: suppressionHashes } } });
  await prisma.event.deleteMany({ where: { entityId: { in: [...companyIds, ...contactPointIds] } } });
  await prisma.contactPoint.deleteMany({ where: { id: { in: contactPointIds } } });
  await prisma.evidence.deleteMany({ where: { id: { in: evidenceIds } } });
  await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
  await server.close();
  await prisma.$disconnect();
});

describe('Deterministic ranking and Daily Action API', () => {
  it('records a deterministic 100-point receipt idempotently without creating sales actions', async () => {
    const company = await createCompany('Complete Fit');
    await addEvidence(company.id, 'demand');
    await addEvidence(company.id, 'route');
    await addCompanyEmail(company.id, 'complete', true);

    const firstResponse = await refresh(company.id ? [company.id] : []);
    expect(firstResponse.statusCode).toBe(200);
    const first = payload<{
      algorithmVersion: string;
      actions: Array<{
        id: string;
        inputHash: string;
        scores: { total: number };
        nextAction: string;
        reasons: string[];
        actualLeadCreated: boolean;
        actualOutreachCreated: boolean;
        actualSendPerformed: boolean;
      }>;
    }>(firstResponse);
    expect(first.algorithmVersion).toBe('deterministic-ranking-v1');
    expect(first.actions[0]).toEqual(
      expect.objectContaining({
        scores: expect.objectContaining({ total: 100 }),
        nextAction: 'READY_FOR_HUMAN_OUTREACH_REVIEW',
        actualLeadCreated: false,
        actualOutreachCreated: false,
        actualSendPerformed: false
      })
    );
    expect(first.actions[0].reasons).toEqual(
      expect.arrayContaining(['ICP_COUNTRY_MATCH', 'ICP_SECTOR_MATCH', 'HUMAN_OUTREACH_REVIEW_ELIGIBLE'])
    );

    const secondResponse = await refresh([company.id], {
      targetCountries: ['DE', 'TR'],
      targetSectors: ['Logistics', 'Manufacturing']
    });
    const second = payload<typeof first>(secondResponse);
    expect(second.actions[0].id).toBe(first.actions[0].id);
    expect(second.actions[0].inputHash).toBe(first.actions[0].inputHash);
    expect(await prisma.companyRankingReceipt.count({ where: { companyId: company.id } })).toBe(1);
    expect(await prisma.event.count({ where: { type: 'COMPANY_RANKING_RECORDED', entityId: company.id } })).toBe(1);
    expect(await prisma.lead.count({ where: { companyId: company.id } })).toBe(0);
    expect(await prisma.activity.count({ where: { lead: { companyId: company.id } } })).toBe(0);

    const listResponse = await server.inject({ method: 'GET', url: `/api/companies/${company.id}/ranking-receipts` });
    expect(listResponse.statusCode).toBe(200);
    expect(payload<Array<{ id: string }>>(listResponse)).toEqual([expect.objectContaining({ id: first.actions[0].id })]);

    const unboundedList = await server.inject({
      method: 'GET',
      url: `/api/companies/${company.id}/ranking-receipts?limit=101`
    });
    expect(unboundedList.statusCode).toBe(400);
  });

  it('gives no evidence points to stale, low-confidence, too-old, or future evidence', async () => {
    const company = await createCompany('Evidence Guard');
    await addEvidence(company.id, 'stale', { freshnessStatus: 'STALE' });
    await addEvidence(company.id, 'low', { confidence: 0.4 });
    await addEvidence(company.id, 'old', {
      accessedAt: new Date(EVALUATED_AT.getTime() - 100 * 86_400_000),
      observedAt: new Date(EVALUATED_AT.getTime() - 100 * 86_400_000)
    });
    await addEvidence(company.id, 'future', {
      accessedAt: new Date(EVALUATED_AT.getTime() + 60_000),
      observedAt: new Date(EVALUATED_AT.getTime() + 60_000)
    });

    const response = await refresh([company.id]);
    const action = payload<{ actions: Array<{ scores: { evidence: number; total: number }; nextAction: string; reasons: string[] }> }>(
      response
    ).actions[0];
    expect(action.scores.evidence).toBe(0);
    expect(action.scores.total).toBe(40);
    expect(action.nextAction).toBe('COLLECT_EVIDENCE');
    expect(action.reasons).toEqual(
      expect.arrayContaining([
        'STALE_EVIDENCE_IGNORED',
        'LOW_CONFIDENCE_EVIDENCE_IGNORED',
        'EVIDENCE_TOO_OLD_IGNORED',
        'FUTURE_EVIDENCE_IGNORED',
        'NO_QUALIFIED_CURRENT_EVIDENCE'
      ])
    );
  });

  it('does not convert a public but unverified contact point into readiness', async () => {
    const company = await createCompany('Public Contact');
    await addEvidence(company.id, 'current');
    const point = await createContactPoint({
      companyId: company.id,
      type: 'EMAIL',
      classification: 'COMPANY_GENERAL',
      value: `public-${RUN_ID}@example.com`,
      countryCode: 'TR',
      sourceUrl: `https://${RUN_ID}.example.com/public-contact`,
      sourceIsPublic: true,
      collectedAt: new Date(),
      confidence: 0.95,
      collectionPurpose: 'Ranking public-contact test',
      dataProcessingBasis: 'NOT_PERSONAL_DATA',
      noticeStatus: 'NOT_REQUIRED',
      actor: 'ranking-test'
    });
    contactPointIds.push(point.id);

    const action = payload<{
      actions: Array<{ scores: { contact: number; permission: number }; nextAction: string; reasons: string[] }>;
    }>(await refresh([company.id])).actions[0];
    expect(action.scores.contact).toBe(0);
    expect(action.scores.permission).toBe(0);
    expect(action.nextAction).toBe('VERIFY_CONTACT_POINT');
    expect(action.reasons).toContain('NO_VERIFIED_CONTACT_FOR_CHANNEL');
  });

  it('routes a verified contact without ALLOWED permission to human permission review', async () => {
    const company = await createCompany('Permission Review');
    await addEvidence(company.id, 'current');
    await addCompanyEmail(company.id, 'review', false);

    const action = payload<{
      actions: Array<{ scores: { contact: number; permission: number }; nextAction: string; reasons: string[] }>;
    }>(await refresh([company.id])).actions[0];
    expect(action.scores.contact).toBe(20);
    expect(action.scores.permission).toBe(0);
    expect(action.nextAction).toBe('REVIEW_COMMUNICATION_PERMISSION');
    expect(action.reasons).toContain('NO_ALLOWED_COMMUNICATION_PERMISSION');
  });

  it('surfaces global suppression and removes permission readiness', async () => {
    const company = await createCompany('Suppressed Recipient');
    await addEvidence(company.id, 'current');
    const point = await addCompanyEmail(company.id, 'suppressed', true);
    const hash = buildRecipientHash('EMAIL', point.normalizedValue);
    suppressionHashes.push(hash);
    await prisma.suppressionEntry.create({
      data: {
        channel: 'EMAIL',
        recipientHash: hash,
        reason: 'Synthetic global suppression test.',
        source: 'RANKING_TEST',
        recordedBy: 'ranking-test'
      }
    });

    const action = payload<{
      actions: Array<{ scores: { contact: number; permission: number }; nextAction: string; reasons: string[] }>;
    }>(await refresh([company.id])).actions[0];
    expect(action.scores.contact).toBe(20);
    expect(action.scores.permission).toBe(0);
    expect(action.nextAction).toBe('HONOR_SUPPRESSION');
    expect(action.reasons).toContain('GLOBAL_SUPPRESSION_PRESENT');
  });

  it('keeps company verification as the highest-priority safe action', async () => {
    const company = await createCompany('Low Company Confidence', { confidence: 0.5 });
    await addEvidence(company.id, 'current-a');
    await addEvidence(company.id, 'current-b');
    await addCompanyEmail(company.id, 'low-company', true);

    const action = payload<{ actions: Array<{ nextAction: string; scores: { companyConfidence: number } }> }>(
      await refresh([company.id])
    ).actions[0];
    expect(action.scores.companyConfidence).toBe(10);
    expect(action.nextAction).toBe('VERIFY_COMPANY');
  });

  it('sorts Daily Actions by score with a deterministic name/id tie-breaker', async () => {
    const high = await createCompany('Sort High');
    const low = await createCompany('Sort Low', { country: 'DE', sector: 'Retail', confidence: 0.5 });
    await addEvidence(high.id, 'sort-a');
    await addEvidence(high.id, 'sort-b');

    const response = await refresh([low.id, high.id]);
    const actions = payload<{ actions: Array<{ company: { id: string }; scores: { total: number } }> }>(response).actions;
    expect(actions.map((action) => action.company.id)).toEqual([high.id, low.id]);
    expect(actions[0].scores.total).toBeGreaterThan(actions[1].scores.total);
  });

  it('rejects duplicate or non-rankable company selections before writing receipts', async () => {
    const active = await createCompany('Selection Active');
    const inactive = await createCompany('Selection Archived', { status: 'ARCHIVED' });

    const duplicateResponse = await refresh([active.id, active.id]);
    expect(duplicateResponse.statusCode).toBe(400);
    const inactiveResponse = await refresh([active.id, inactive.id]);
    expect(inactiveResponse.statusCode).toBe(409);
    expect(await prisma.companyRankingReceipt.count({ where: { companyId: { in: [active.id, inactive.id] } } })).toBe(0);
  });

  it('enforces component and total-score integrity in PostgreSQL', async () => {
    const company = await createCompany('DB Score Constraint');
    await expect(
      prisma.companyRankingReceipt.create({
        data: {
          companyId: company.id,
          algorithmVersion: 'db-test-v1',
          policyVersion: 'db-policy-v1',
          inputHash: 'a'.repeat(64),
          context: {},
          evidenceReceipt: [],
          contactReceipt: [],
          icpFitScore: 20,
          companyConfidenceScore: 20,
          evidenceScore: 20,
          contactScore: 20,
          permissionScore: 20,
          totalScore: 99,
          reasonCodes: [],
          nextAction: 'COLLECT_EVIDENCE',
          evaluatedAt: EVALUATED_AT,
          createdBy: 'db-test'
        }
      })
    ).rejects.toThrow();
  });
});
