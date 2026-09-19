import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { buildRecipientHash, createContactPoint } from '../src/lib/contact-points';
import { prisma } from '../src/lib/prisma';
import { recordCompanyRanking } from '../src/lib/ranking';

// Integration suite for database invariants that the Prisma schema cannot
// express on its own (PR-C migration drift cleanup):
//
//  1. OutreachApproval_revision_belongs_to_draft_fkey - an approval may only
//     reference a revision that belongs to the approval's own draft.
//  2. OutreachApproval_content_matches_revision_fkey - the recorded content
//     hash must equal the referenced revision hash.
//  3. RecommendationExposure's lookup index keeps its explicit, <= 63 byte
//     name ("rec_exposure_lookup_idx").
//
// These are PostgreSQL-only guarantees: the Prisma schema declares them so that
// they stop showing up as migration drift, which also means a future Prisma
// upgrade or migration could silently drop them. This suite fails if that
// happens, and it does so at the database level (raw inserts) rather than
// through the application layer, which could mask a missing constraint.
const RUN_ID = `migration-invariants-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const POLICY_VERSION = 'communication-policy-migration-invariant-v1';
const DRAFT_FK = 'OutreachApproval_revision_belongs_to_draft_fkey';
const CONTENT_FK = 'OutreachApproval_content_matches_revision_fkey';
const EXPOSURE_INDEX = 'rec_exposure_lookup_idx';

interface ConstraintRow {
  conname: string;
  definition: string;
  delete_action: string;
  update_action: string;
}

interface IndexRow {
  relname: string;
  definition: string;
  is_unique: boolean;
  is_valid: boolean;
}

const companyIds: string[] = [];
const contactPointIds: string[] = [];
const rankingReceiptIds: string[] = [];
const draftIds: string[] = [];
const exposureIds: string[] = [];

function contentHashFor(label: string): string {
  return createHash('sha256').update(`${label}-${RUN_ID}`).digest('hex');
}

async function createFixture(label: string) {
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

  const point = await createContactPoint({
    companyId: company.id,
    type: 'EMAIL',
    classification: 'COMPANY_GENERAL',
    value: `${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${RUN_ID}@example.com`,
    countryCode: 'TR',
    sourceUrl: `https://${RUN_ID}.example.com/contact/${label}`,
    sourceName: 'Synthetic migration invariant source',
    sourceIsPublic: true,
    collectedAt: new Date(),
    confidence: 0.95,
    collectionPurpose: 'Migration invariant regression test',
    dataProcessingBasis: 'NOT_PERSONAL_DATA',
    noticeStatus: 'NOT_REQUIRED',
    actor: 'migration-invariant-test',
  });
  contactPointIds.push(point.id);

  const ranking = await recordCompanyRanking(company.id, {
    companyIds: [company.id],
    targetCountries: ['TR'],
    targetSectors: ['Manufacturing'],
    channel: 'EMAIL',
    purpose: 'SALES_OUTREACH',
    jurisdictionCountry: 'TR',
    policyVersion: 'icp-policy-migration-invariant-v1',
    evaluatedAt: new Date(),
    createdBy: 'migration-invariant-reviewer',
  });
  rankingReceiptIds.push(ranking.id);

  return { company, point };
}

async function createDraftWithRevision(label: string) {
  const { company, point } = await createFixture(label);
  const rankingReceiptId = rankingReceiptIds[rankingReceiptIds.length - 1];
  const draft = await prisma.outreachDraft.create({
    data: {
      companyId: company.id,
      contactPointId: point.id,
      rankingReceiptId,
      channel: 'EMAIL',
      purpose: 'SALES_OUTREACH',
      jurisdictionCountry: 'TR',
      policyVersion: POLICY_VERSION,
      templateKey: 'migration-invariant',
      templateVersion: 'v1',
      author: 'migration-invariant-author',
      recipientSnapshot: {
        recipientHash: buildRecipientHash('EMAIL', point.normalizedValue),
        rawRecipientStored: false,
      },
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });
  draftIds.push(draft.id);

  const revision = await prisma.outreachDraftRevision.create({
    data: {
      draftId: draft.id,
      revisionNumber: 1,
      subject: `${label} subject`,
      body: `${label} body`,
      contentHash: contentHashFor(label),
      editedBy: 'migration-invariant-author',
      editReason: 'Fixture revision for a database invariant regression test.',
    },
  });

  return { draft, revision };
}

// Raw insert on purpose: the composite foreign keys are the subject under test,
// so the write has to bypass any application-level guard that could reject it
// for an unrelated reason. A REJECTED decision is used so the receipt does not
// require a communication permission (the approved-permission CHECK is covered
// elsewhere); the foreign keys under test do not depend on the decision.
async function insertApproval(values: {
  draftId: string;
  revisionId: string;
  contentHash: string;
}): Promise<string> {
  const id = `migration-invariant-${randomUUID()}`;
  const gateReceipt = JSON.stringify({
    decision: 'DENY',
    reasons: ['SYNTHETIC_INVARIANT_TEST'],
    actualSendPerformed: false,
    rawRecipientStored: false,
  });
  await prisma.$executeRaw`
    INSERT INTO "OutreachApproval" (
      "id", "draftId", "revisionId", "decision", "decisionReason", "reviewedBy",
      "policyVersion", "gateReceipt", "contentHash", "decidedAt"
    ) VALUES (
      ${id}, ${values.draftId}, ${values.revisionId},
      'REJECTED'::"OutreachApprovalDecision",
      ${'Synthetic receipt for a database invariant test.'},
      ${'migration-invariant-reviewer'},
      ${POLICY_VERSION},
      ${gateReceipt}::jsonb,
      ${values.contentHash},
      ${new Date()}
    )`;
  return id;
}

// Collects the error text from every layer Prisma may use (driver adapter or
// native) so the assertion stays valid whoever wraps the PostgreSQL error.
async function captureFailure(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    const candidate = error as {
      code?: unknown;
      message?: unknown;
      meta?: { code?: unknown; message?: unknown };
    };
    const parts = [
      candidate.code,
      candidate.message,
      candidate.meta?.code,
      candidate.meta?.message,
    ].filter((part): part is string => typeof part === 'string' && part.length > 0);
    return parts.join(' | ');
  }
  throw new Error('expected PostgreSQL to reject this write, but it succeeded');
}

describe('PostgreSQL migration invariants', () => {
  let draftA: { id: string };
  let revisionA: { id: string; draftId: string; contentHash: string };
  let draftB: { id: string };
  let revisionB: { id: string; draftId: string; contentHash: string };

  beforeAll(async () => {
    await prisma.$connect();
    const first = await createDraftWithRevision('Composite A');
    draftA = first.draft;
    revisionA = first.revision;
    const second = await createDraftWithRevision('Composite B');
    draftB = second.draft;
    revisionB = second.revision;
  });

  afterAll(async () => {
    await prisma.outreachApproval.deleteMany({ where: { draftId: { in: draftIds } } });
    await prisma.outreachDraftRevision.deleteMany({ where: { draftId: { in: draftIds } } });
    await prisma.outreachDraft.deleteMany({ where: { id: { in: draftIds } } });
    await prisma.companyRankingReceipt.deleteMany({ where: { id: { in: rankingReceiptIds } } });
    await prisma.recommendationOutcome.deleteMany({ where: { exposureId: { in: exposureIds } } });
    await prisma.recommendationExposure.deleteMany({ where: { id: { in: exposureIds } } });
    await prisma.opportunity.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.contactPoint.deleteMany({ where: { id: { in: contactPointIds } } });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
    await prisma.$disconnect();
  });

  it('keeps both composite outreach approval foreign keys in PostgreSQL', async () => {
    const constraints = await prisma.$queryRaw<ConstraintRow[]>`
      SELECT c.conname,
             pg_get_constraintdef(c.oid) AS definition,
             c.confdeltype::text AS delete_action,
             c.confupdtype::text AS update_action
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE c.contype = 'f' AND n.nspname = 'public' AND t.relname = 'OutreachApproval'
      ORDER BY c.conname`;

    const byName = new Map(constraints.map((row) => [row.conname, row]));

    const revisionDraft = byName.get(DRAFT_FK);
    expect(revisionDraft).toBeDefined();
    expect(revisionDraft?.definition).toMatch(
      /FOREIGN KEY \("revisionId", "draftId"\) REFERENCES "OutreachDraftRevision"\(id, "draftId"\)/
    );
    expect(revisionDraft?.delete_action).toBe('r'); // ON DELETE RESTRICT
    expect(revisionDraft?.update_action).toBe('c'); // ON UPDATE CASCADE

    const contentMatch = byName.get(CONTENT_FK);
    expect(contentMatch).toBeDefined();
    expect(contentMatch?.definition).toMatch(
      /FOREIGN KEY \("revisionId", "draftId", "contentHash"\) REFERENCES "OutreachDraftRevision"\(id, "draftId", "contentHash"\)/
    );
    expect(contentMatch?.delete_action).toBe('r');
    expect(contentMatch?.update_action).toBe('c');

    // Exactly three foreign keys point at OutreachDraftRevision: the
    // single-column relation plus the two composite invariants. Dropping either
    // composite constraint silently must break this suite.
    expect(
      constraints.filter((row) => row.definition.includes('"OutreachDraftRevision"'))
    ).toHaveLength(3);
  });

  it('rejects an approval whose revision belongs to a different draft', async () => {
    // Fixture premise: revision B really belongs to draft B.
    expect(revisionB.draftId).toBe(draftB.id);
    expect(revisionB.draftId).not.toBe(draftA.id);

    const failure = await captureFailure(() =>
      insertApproval({
        draftId: draftA.id,
        revisionId: revisionB.id,
        contentHash: revisionB.contentHash,
      })
    );

    expect(failure).toContain(DRAFT_FK);
    expect(failure).toContain('23503');
    expect(await prisma.outreachApproval.count({ where: { draftId: draftA.id } })).toBe(0);
  });

  it('rejects an approval whose content hash does not match the revision', async () => {
    const failure = await captureFailure(() =>
      insertApproval({
        draftId: draftA.id,
        revisionId: revisionA.id,
        contentHash: 'b'.repeat(64),
      })
    );

    expect(failure).toContain(CONTENT_FK);
    expect(failure).toContain('23503');
    expect(await prisma.outreachApproval.count({ where: { draftId: draftA.id } })).toBe(0);
  });

  it('accepts a receipt that satisfies both composite invariants', async () => {
    const id = await insertApproval({
      draftId: draftA.id,
      revisionId: revisionA.id,
      contentHash: revisionA.contentHash,
    });

    const stored = await prisma.outreachApproval.findUniqueOrThrow({ where: { id } });
    expect(stored.draftId).toBe(draftA.id);
    expect(stored.revisionId).toBe(revisionA.id);
    expect(stored.contentHash).toBe(revisionA.contentHash);
  });

  it('keeps the explicit recommendation exposure lookup index', async () => {
    const indexes = await prisma.$queryRaw<IndexRow[]>`
      SELECT i.relname,
             pg_get_indexdef(x.indexrelid) AS definition,
             x.indisunique AS is_unique,
             x.indisvalid AS is_valid
      FROM pg_index x
      JOIN pg_class i ON i.oid = x.indexrelid
      JOIN pg_class t ON t.oid = x.indrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public' AND t.relname = 'RecommendationExposure'`;

    const lookup = indexes.find((row) => row.relname === EXPOSURE_INDEX);
    expect(lookup).toBeDefined();
    expect(lookup?.definition).toMatch(
      /USING btree \("recommendationType", "recommendationId", "exposedAt"\)/
    );
    expect(lookup?.is_unique).toBe(false);
    expect(lookup?.is_valid).toBe(true);

    // The name is pinned explicitly because the Prisma-generated name exceeded
    // PostgreSQL's 63 byte identifier limit and was silently truncated.
    expect(EXPOSURE_INDEX.length).toBeLessThanOrEqual(63);
    expect(indexes.map((row) => row.relname)).not.toContain(
      'RecommendationExposure_recommendationType_recommendationId_expo'
    );
  });

  it('enforces the money value contract in PostgreSQL', async () => {
    // PR-BC1 (BC1 + BC6): a real loss must be storable as a negative
    // GROSS_PROFIT, magnitudes stay non-negative, GROSS_PROFIT always carries
    // value + currency, and Opportunity estimates are never negative and carry a
    // canonical 3-letter currency. These are DB-level guarantees, so the writes
    // below bypass the application layer on purpose.
    const companyId = companyIds[0];
    const exposureId = `migration-invariant-exposure-${randomUUID()}`;
    await prisma.$executeRaw`
      INSERT INTO "RecommendationExposure" (
        "id", "exposureKey", "recommendationType", "recommendationId", "algorithmVersion",
        "inputHash", "mode", "position", "actor", "exposedAt"
      ) VALUES (
        ${exposureId}, ${`key-${exposureId}`}, 'LEAD_RANKING'::"RecommendationType",
        ${'migration-invariant-recommendation'}, ${'deterministic-ranking-v1'},
        ${'a'.repeat(64)}, 'EXPLOITATION'::"RecommendationExposureMode", 1,
        ${'migration-invariant-actor'}, ${new Date()}
      )`;
    exposureIds.push(exposureId);

    const insertOutcome = (values: {
      outcomeKey: string;
      outcomeType: string;
      valueMinor: number | null;
      currency: string | null;
    }) =>
      prisma.$executeRaw`
        INSERT INTO "RecommendationOutcome" (
          "id", "exposureId", "outcomeKey", "outcomeType", "occurredAt", "valueMinor", "currency", "recordedBy"
        ) VALUES (
          ${`migration-invariant-outcome-${randomUUID()}`}, ${exposureId}, ${values.outcomeKey},
          ${values.outcomeType}::"RecommendationOutcomeType", ${new Date()}, ${values.valueMinor},
          ${values.currency}, ${'migration-invariant-recorder'}
        )`;

    const negativeMagnitude = await captureFailure(() =>
      insertOutcome({ outcomeKey: 'negative-human-action', outcomeType: 'HUMAN_ACTION', valueMinor: -1, currency: 'TRY' })
    );
    expect(negativeMagnitude).toContain('RecommendationOutcome_value_by_type');
    expect(negativeMagnitude).toContain('23514');

    await expect(
      insertOutcome({ outcomeKey: 'negative-gross-profit', outcomeType: 'GROSS_PROFIT', valueMinor: -450000, currency: 'TRY' })
    ).resolves.toBe(1);

    const unvaluedGrossProfit = await captureFailure(() =>
      insertOutcome({ outcomeKey: 'gp-without-value', outcomeType: 'GROSS_PROFIT', valueMinor: null, currency: null })
    );
    expect(unvaluedGrossProfit).toContain('RecommendationOutcome_gross_profit_value_required');
    expect(unvaluedGrossProfit).toContain('23514');

    const insertOpportunity = (estimatedValue: string | null, currency: string | null) =>
      prisma.$executeRaw`
        INSERT INTO "Opportunity" ("id", "companyId", "stage", "estimatedValue", "currency", "createdAt", "updatedAt")
        VALUES (
          ${`migration-invariant-opportunity-${randomUUID()}`}, ${companyId},
          'QUALIFICATION'::"OpportunityStage", ${estimatedValue}::decimal, ${currency}, ${new Date()}, ${new Date()}
        )`;

    const negativeEstimate = await captureFailure(() => insertOpportunity('-1.00', 'TRY'));
    expect(negativeEstimate).toContain('Opportunity_estimated_value_nonnegative');
    expect(negativeEstimate).toContain('23514');

    const missingCurrency = await captureFailure(() => insertOpportunity('1000.00', null));
    expect(missingCurrency).toContain('Opportunity_estimated_value_currency_shape');

    const lowercaseCurrency = await captureFailure(() => insertOpportunity('1000.00', 'try'));
    expect(lowercaseCurrency).toContain('Opportunity_estimated_value_currency_shape');

    await expect(insertOpportunity('1000.00', 'TRY')).resolves.toBe(1);
  });
});
