import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Prisma, type Company } from '@prisma/client';
import { prisma } from '../src/lib/prisma';

// Integration tests against a real Postgres database (docker/docker-compose.yml).
// Every record created here uses a run-unique marker and is deleted in
// afterAll, so this suite is safe to re-run and leaves no residue.
const RUN_ID = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const companyIds: string[] = [];

async function createTestCompany(overrides: Partial<Parameters<typeof prisma.company.create>[0]['data']> = {}) {
  const company = await prisma.company.create({
    data: {
      name: `Test Company ${RUN_ID}`,
      normalizedName: `TEST COMPANY ${RUN_ID}`.toUpperCase(),
      domain: `${RUN_ID}.example.com`,
      ...overrides
    }
  });
  companyIds.push(company.id);
  return company;
}

describe('Prisma data foundation models', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    // Delete in FK-safe order: leaf tables first, Company last.
    await prisma.evidence.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.event.deleteMany({ where: { entityId: { in: companyIds } } });
    await prisma.followUp.deleteMany({ where: { lead: { companyId: { in: companyIds } } } });
    await prisma.activity.deleteMany({ where: { lead: { companyId: { in: companyIds } } } });
    await prisma.opportunity.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.lead.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.contact.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
    await prisma.$disconnect();
  });

  it('creates a Company with defaults applied', async () => {
    const company = await createTestCompany();
    expect(company.status).toBe('ACTIVE');
    expect(company.confidence).toBe(1);
    expect(company.createdAt).toBeInstanceOf(Date);
  });

  it('allows two distinct companies to share one domain (holding/subsidiary case)', async () => {
    // Company.domain is deliberately NOT globally unique — a holding company
    // and its subsidiary can share one corporate domain in real Turkish B2B
    // data (found + verified during the 2026-08-13 review gate, see
    // REVIEW-issue2.md point A). Uniqueness for entity resolution is a
    // deterministic-matching concern (entity-resolution.ts), not a DB
    // constraint.
    const domain = `shared-${RUN_ID}.example.com`;
    const parent = await createTestCompany({
      name: `Shared Domain Holding ${RUN_ID}`,
      normalizedName: `SHARED DOMAIN HOLDING ${RUN_ID}`,
      domain
    });
    const subsidiary = await createTestCompany({
      name: `Shared Domain Lojistik ${RUN_ID}`,
      normalizedName: `SHARED DOMAIN LOJISTIK ${RUN_ID}`,
      domain
    });

    expect(subsidiary.id).not.toBe(parent.id);
    expect(subsidiary.domain).toBe(parent.domain);
  });

  it('enforces a unique constraint on Company.taxNumber', async () => {
    const taxNumber = `TAX${RUN_ID}`;
    await createTestCompany({
      name: `Tax A ${RUN_ID}`,
      normalizedName: `TAX A ${RUN_ID}`,
      domain: `tax-a-${RUN_ID}.example.com`,
      taxNumber
    });

    await expect(
      createTestCompany({
        name: `Tax B ${RUN_ID}`,
        normalizedName: `TAX B ${RUN_ID}`,
        domain: `tax-b-${RUN_ID}.example.com`,
        taxNumber
      })
    ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
  });

  it('links a Contact to its Company and prevents duplicate emails within the same company', async () => {
    const company = await createTestCompany({
      name: `Contact Co ${RUN_ID}`,
      normalizedName: `CONTACT CO ${RUN_ID}`,
      domain: `contact-co-${RUN_ID}.example.com`
    });

    const email = `ali-${RUN_ID}@example.com`;
    await prisma.contact.create({
      data: { companyId: company.id, fullName: 'Ali Veli', email }
    });

    await expect(
      prisma.contact.create({
        data: { companyId: company.id, fullName: 'Ali Veli Duplicate', email }
      })
    ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);

    const withContacts = await prisma.company.findUniqueOrThrow({
      where: { id: company.id },
      include: { contacts: true }
    });
    expect(withContacts.contacts).toHaveLength(1);
  });

  it('creates a Lead linked to a Company and optional Contact, then an Activity and a FollowUp on it', async () => {
    const company = await createTestCompany({
      name: `Lead Co ${RUN_ID}`,
      normalizedName: `LEAD CO ${RUN_ID}`,
      domain: `lead-co-${RUN_ID}.example.com`
    });
    const contact = await prisma.contact.create({
      data: { companyId: company.id, fullName: 'Lead Contact', email: `lead-${RUN_ID}@example.com` }
    });
    const lead = await prisma.lead.create({
      data: { companyId: company.id, contactId: contact.id, status: 'NEW', sourceChannel: 'REFERRAL' }
    });

    const activity = await prisma.activity.create({
      data: { leadId: lead.id, contactId: contact.id, type: 'EMAIL_DRAFT', note: 'first touch' }
    });
    expect(activity.type).toBe('EMAIL_DRAFT');

    const followUp = await prisma.followUp.create({
      data: { leadId: lead.id, dueAt: new Date(Date.now() + 86_400_000), reason: 'call back' }
    });
    expect(followUp.status).toBe('PENDING');

    const leadWithRelations = await prisma.lead.findUniqueOrThrow({
      where: { id: lead.id },
      include: { company: true, contact: true, activities: true, followUps: true }
    });
    expect(leadWithRelations.company.id).toBe(company.id);
    expect(leadWithRelations.contact?.id).toBe(contact.id);
    expect(leadWithRelations.activities).toHaveLength(1);
    expect(leadWithRelations.followUps).toHaveLength(1);
  });

  it('creates an Opportunity with a Decimal estimatedValue linked to Company and Lead', async () => {
    const company = await createTestCompany({
      name: `Opp Co ${RUN_ID}`,
      normalizedName: `OPP CO ${RUN_ID}`,
      domain: `opp-co-${RUN_ID}.example.com`
    });
    const lead = await prisma.lead.create({ data: { companyId: company.id } });

    const opportunity = await prisma.opportunity.create({
      data: {
        companyId: company.id,
        leadId: lead.id,
        stage: 'PROPOSAL',
        estimatedValue: new Prisma.Decimal('15000.50'),
        currency: 'TRY'
      }
    });

    expect(opportunity.estimatedValue?.toString()).toBe('15000.5');
    expect(opportunity.stage).toBe('PROPOSAL');
  });

  it('creates an Event and links Evidence to both a Company and that Event', async () => {
    const company = await createTestCompany({
      name: `Evidence Co ${RUN_ID}`,
      normalizedName: `EVIDENCE CO ${RUN_ID}`,
      domain: `evidence-co-${RUN_ID}.example.com`
    });

    const event = await prisma.event.create({
      data: {
        type: 'COMPANY_DISCOVERED',
        entityType: 'Company',
        entityId: company.id,
        actor: 'test-suite',
        metadata: { note: 'created by prisma-models.test.ts' }
      }
    });
    expect(event.type).toBe('COMPANY_DISCOVERED');
    expect(event.metadata).toEqual({ note: 'created by prisma-models.test.ts' });

    const evidence = await prisma.evidence.create({
      data: {
        companyId: company.id,
        eventId: event.id,
        sourceUrl: `https://example.com/about-${RUN_ID}`,
        sourceName: 'Company website',
        summary: 'Company self-describes as a logistics provider.',
        confidence: 0.6
      }
    });

    expect(evidence.companyId).toBe(company.id);
    expect(evidence.eventId).toBe(event.id);

    const eventWithEvidence = await prisma.event.findUniqueOrThrow({
      where: { id: event.id },
      include: { evidences: true }
    });
    expect(eventWithEvidence.evidences).toHaveLength(1);
  });

  it('merges a duplicate Company via the self-relation and marks it MERGED', async () => {
    const canonical: Company = await createTestCompany({
      name: `Canonical ${RUN_ID}`,
      normalizedName: `CANONICAL ${RUN_ID}`,
      domain: `canonical-${RUN_ID}.example.com`
    });
    const duplicate = await createTestCompany({
      name: `Duplicate ${RUN_ID}`,
      normalizedName: `DUPLICATE ${RUN_ID}`,
      domain: `duplicate-${RUN_ID}.example.com`
    });

    const merged = await prisma.company.update({
      where: { id: duplicate.id },
      data: { status: 'MERGED', mergedIntoId: canonical.id }
    });

    expect(merged.status).toBe('MERGED');
    expect(merged.mergedIntoId).toBe(canonical.id);

    const canonicalWithMerges = await prisma.company.findUniqueOrThrow({
      where: { id: canonical.id },
      include: { mergedFrom: true }
    });
    expect(canonicalWithMerges.mergedFrom.map((c) => c.id)).toContain(duplicate.id);
  });
});
