import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Prisma, type Company } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { ActivityValidationError, createActivity } from '../src/lib/activity';

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
    await prisma.activity.deleteMany({
      where: {
        OR: [
          { lead: { companyId: { in: companyIds } } },
          { contact: { companyId: { in: companyIds } } }
        ]
      }
    });
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

  it('enforces a unique constraint on Company.domain', async () => {
    const domain = `dup-${RUN_ID}.example.com`;
    await createTestCompany({
      name: `Dup A ${RUN_ID}`,
      normalizedName: `DUP A ${RUN_ID}`,
      domain
    });

    await expect(
      createTestCompany({
        name: `Dup B ${RUN_ID}`,
        normalizedName: `DUP B ${RUN_ID}`,
        domain
      })
    ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
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

  it('rejects an Activity with neither leadId nor contactId (helper + DB CHECK constraint)', async () => {
    // Application layer: createActivity fails fast with a validation error.
    await expect(createActivity({ type: 'NOTE', note: 'orphan activity' })).rejects.toThrow(
      ActivityValidationError
    );

    // Defense in depth: writing directly via Prisma is rejected by the
    // "Activity_lead_or_contact_required" CHECK constraint in Postgres.
    await expect(
      prisma.activity.create({ data: { type: 'NOTE', note: 'orphan activity' } })
    ).rejects.toThrow();
  });

  it('creates an Activity through createActivity when a contact is referenced', async () => {
    const company = await createTestCompany({
      name: `Helper Co ${RUN_ID}`,
      normalizedName: `HELPER CO ${RUN_ID}`,
      domain: `helper-co-${RUN_ID}.example.com`
    });
    const contact = await prisma.contact.create({
      data: { companyId: company.id, fullName: 'Helper Contact', email: `helper-${RUN_ID}@example.com` }
    });

    const activity = await createActivity({ type: 'NOTE', contactId: contact.id, note: 'via helper' });
    expect(activity.contactId).toBe(contact.id);
  });

  it('rejects Company.confidence values outside 0..1 (DB CHECK constraint)', async () => {
    await expect(
      createTestCompany({
        name: `Overconfident ${RUN_ID}`,
        normalizedName: `OVERCONFIDENT ${RUN_ID}`,
        domain: `overconfident-${RUN_ID}.example.com`,
        confidence: 1.5
      })
    ).rejects.toThrow();

    await expect(
      createTestCompany({
        name: `Underconfident ${RUN_ID}`,
        normalizedName: `UNDERCONFIDENT ${RUN_ID}`,
        domain: `underconfident-${RUN_ID}.example.com`,
        confidence: -1
      })
    ).rejects.toThrow();
  });

  it('rejects Evidence.confidence values outside 0..1 (DB CHECK constraint)', async () => {
    const company = await createTestCompany({
      name: `Evidence Range Co ${RUN_ID}`,
      normalizedName: `EVIDENCE RANGE CO ${RUN_ID}`,
      domain: `evidence-range-${RUN_ID}.example.com`
    });

    await expect(
      prisma.evidence.create({
        data: {
          companyId: company.id,
          sourceUrl: `https://example.com/range-${RUN_ID}`,
          summary: 'out of range confidence',
          confidence: 1.5
        }
      })
    ).rejects.toThrow();
  });

  it('allows multiple Contacts with NULL email in the same company (documented edge case)', async () => {
    // Postgres treats NULLs as distinct in unique indexes, so the
    // @@unique([companyId, email]) constraint does NOT apply to contacts
    // without an email. This test pins down that (intentional) behavior —
    // see the NOTE on the Contact model in prisma/schema.prisma.
    const company = await createTestCompany({
      name: `Null Email Co ${RUN_ID}`,
      normalizedName: `NULL EMAIL CO ${RUN_ID}`,
      domain: `null-email-${RUN_ID}.example.com`
    });

    await prisma.contact.create({
      data: { companyId: company.id, fullName: 'No Email One' }
    });
    await prisma.contact.create({
      data: { companyId: company.id, fullName: 'No Email Two' }
    });

    const contacts = await prisma.contact.findMany({ where: { companyId: company.id } });
    expect(contacts).toHaveLength(2);
    expect(contacts.every((c) => c.email === null)).toBe(true);
  });
});
