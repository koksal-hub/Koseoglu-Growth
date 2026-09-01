import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../src/lib/prisma';
import { buildServer } from '../src/index';
import { buildRecipientHash } from '../src/lib/contact-points';

const RUN_ID = `contact-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const companyIds: string[] = [];
const contactIds: string[] = [];
const contactPointIds: string[] = [];
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
      domain: `${label.toLowerCase().replace(/\s+/g, '-')}-${RUN_ID}.example.com`
    }
  });
  companyIds.push(company.id);
  return company;
}

async function createPerson(companyId: string, label: string) {
  const contact = await prisma.contact.create({
    data: { companyId, fullName: `${label} ${RUN_ID}` }
  });
  contactIds.push(contact.id);
  return contact;
}

async function createPoint(
  companyId: string,
  overrides: Record<string, unknown> = {}
) {
  const response = await server.inject({
    method: 'POST',
    url: `/api/companies/${companyId}/contact-points`,
    payload: {
      type: 'EMAIL',
      classification: 'COMPANY_GENERAL',
      value: `INFO-${RUN_ID}@Example.com`,
      countryCode: 'TR',
      sourceUrl: `https://${RUN_ID}.example.com/contact`,
      sourceName: 'Public company contact page',
      sourceIsPublic: true,
      collectedAt: new Date().toISOString(),
      confidence: 0.9,
      collectionPurpose: 'B2B company research',
      dataProcessingBasis: 'NOT_PERSONAL_DATA',
      noticeStatus: 'NOT_REQUIRED',
      actor: 'contact-test',
      ...overrides
    }
  });
  if (response.statusCode === 201) {
    contactPointIds.push(payload<{ id: string }>(response).id);
  }
  return response;
}

async function verifyPoint(contactPointId: string, confidence = 0.9) {
  return server.inject({
    method: 'POST',
    url: `/api/contact-points/${contactPointId}/verification`,
    payload: {
      status: 'VERIFIED',
      confidence,
      reason: 'Address independently checked by a human reviewer.',
      verifiedBy: 'contact-reviewer'
    }
  });
}

async function recordPermission(
  contactPointId: string,
  overrides: Record<string, unknown> = {}
) {
  return server.inject({
    method: 'POST',
    url: `/api/contact-points/${contactPointId}/permissions`,
    payload: {
      channel: 'EMAIL',
      purpose: 'SALES_OUTREACH',
      jurisdictionCountry: 'TR',
      status: 'ALLOWED',
      dataProcessingBasis: 'NOT_PERSONAL_DATA',
      communicationRule: 'B2B_RECIPIENT_EXCEPTION',
      recipientCategory: 'TRADER_OR_CRAFTSMAN',
      evidenceUrl: `https://${RUN_ID}.example.com/legal-review`,
      policyVersion: 'contact-policy-2026-09-01',
      checkedAt: new Date().toISOString(),
      reviewedBy: 'policy-reviewer',
      reason: 'Recipient category and communication rule reviewed by a human.',
      ...overrides
    }
  });
}

async function gate(contactPointId: string, overrides: Record<string, string> = {}) {
  const query = new URLSearchParams({
    channel: 'EMAIL',
    purpose: 'SALES_OUTREACH',
    jurisdictionCountry: 'TR',
    ...overrides
  });
  return server.inject({
    method: 'GET',
    url: `/api/contact-points/${contactPointId}/communication-gate?${query.toString()}`
  });
}

beforeAll(async () => {
  server = buildServer().server;
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.communicationPermission.deleteMany({ where: { contactPointId: { in: contactPointIds } } });
  await prisma.suppressionEntry.deleteMany({ where: { recipientHash: { in: suppressionHashes } } });
  await prisma.event.deleteMany({ where: { entityId: { in: contactPointIds } } });
  await prisma.contactPoint.deleteMany({ where: { id: { in: contactPointIds } } });
  await prisma.contact.deleteMany({ where: { id: { in: contactIds } } });
  await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
  await server.close();
  await prisma.$disconnect();
});

describe('ContactPoint and communication permission gate', () => {
  it('stores a normalized company-general email with provenance but creates no Lead or Activity', async () => {
    const company = await createCompany('General Contact');
    const response = await createPoint(company.id);
    expect(response.statusCode).toBe(201);
    const point = payload<{
      id: string;
      contactId: string | null;
      normalizedValue: string;
      verificationStatus: string;
      permissions: unknown[];
    }>(response);
    expect(point.contactId).toBeNull();
    expect(point.normalizedValue).toBe(`info-${RUN_ID}@example.com`);
    expect(point.verificationStatus).toBe('UNVERIFIED');
    expect(point.permissions).toEqual([]);
    expect(await prisma.lead.count({ where: { companyId: company.id } })).toBe(0);
    expect(await prisma.activity.count({ where: { contact: { companyId: company.id } } })).toBe(0);

    const event = await prisma.event.findFirstOrThrow({
      where: { type: 'CONTACT_POINT_COLLECTED', entityId: point.id }
    });
    expect(event.metadata).toEqual(expect.objectContaining({ automaticallySendable: false }));
  });

  it('stores a person-work email only with a same-company Contact and retention deadline', async () => {
    const company = await createCompany('Person Contact');
    const contact = await createPerson(company.id, 'Ayse Reviewer');
    const response = await createPoint(company.id, {
      contactId: contact.id,
      classification: 'PERSON_WORK',
      value: `Ayse.${RUN_ID}@Example.com`,
      dataProcessingBasis: 'LEGITIMATE_INTEREST',
      noticeStatus: 'PROVIDED',
      noticeProvidedAt: new Date().toISOString(),
      retentionUntil: new Date(Date.now() + 30 * 86_400_000).toISOString()
    });
    expect(response.statusCode).toBe(201);
    expect(payload<{ contactId: string; normalizedValue: string }>(response)).toEqual(
      expect.objectContaining({ contactId: contact.id, normalizedValue: `ayse.${RUN_ID}@example.com` })
    );
  });

  it('rejects a Contact belonging to another Company at both API and DB boundaries', async () => {
    const companyA = await createCompany('Owner A');
    const companyB = await createCompany('Owner B');
    const contactB = await createPerson(companyB.id, 'Wrong Owner');
    const apiResponse = await createPoint(companyA.id, {
      contactId: contactB.id,
      classification: 'PERSON_WORK',
      value: `wrong-owner-${RUN_ID}@example.com`,
      dataProcessingBasis: 'LEGITIMATE_INTEREST',
      noticeStatus: 'PROVIDED',
      noticeProvidedAt: new Date().toISOString(),
      retentionUntil: new Date(Date.now() + 30 * 86_400_000).toISOString()
    });
    expect(apiResponse.statusCode).toBe(409);

    await expect(
      prisma.contactPoint.create({
        data: {
          companyId: companyA.id,
          contactId: contactB.id,
          type: 'EMAIL',
          classification: 'PERSON_WORK',
          normalizedValue: `db-wrong-owner-${RUN_ID}@example.com`,
          countryCode: 'TR',
          sourceUrl: 'https://example.com/contact',
          sourceIsPublic: true,
          collectedAt: new Date(),
          confidence: 0.8,
          collectionPurpose: 'DB invariant test',
          dataProcessingBasis: 'LEGITIMATE_INTEREST',
          noticeStatus: 'PROVIDED',
          noticeProvidedAt: new Date(),
          retentionUntil: new Date(Date.now() + 86_400_000)
        }
      })
    ).rejects.toThrow();

    await expect(
      prisma.contactPoint.create({
        data: {
          companyId: companyB.id,
          contactId: contactB.id,
          type: 'EMAIL',
          classification: 'PERSON_WORK',
          normalizedValue: `db-wrong-basis-${RUN_ID}@example.com`,
          countryCode: 'TR',
          sourceUrl: 'https://example.com/contact',
          sourceIsPublic: true,
          collectedAt: new Date(),
          confidence: 0.8,
          collectionPurpose: 'DB basis invariant test',
          dataProcessingBasis: 'NOT_PERSONAL_DATA',
          noticeStatus: 'PROVIDED',
          noticeProvidedAt: new Date(),
          retentionUntil: new Date(Date.now() + 86_400_000)
        }
      })
    ).rejects.toThrow();
  });

  it.each([
    ['invalid email', { value: 'not-an-email' }],
    ['email with consecutive dots', { value: 'invalid..local@example.com' }],
    ['email with empty domain label', { value: 'invalid@example..com' }],
    ['non-E.164 phone', { type: 'PHONE', value: '0532 123 45 67' }],
    ['phone containing letters', { type: 'PHONE', value: '+90 CALL 5321234567' }],
    ['phone with two plus signs', { type: 'PHONE', value: '++905321234567' }],
    ['blank source URL', { sourceUrl: '' }],
    ['file source URL', { sourceUrl: 'file:///private/contacts.csv' }],
    ['credentialed URL', { sourceUrl: 'https://user:password@example.com/contact' }],
    ['secret query URL', { sourceUrl: 'https://example.com/contact?api_key=secret' }]
  ])('rejects %s', async (_description, overrides) => {
    const company = await createCompany(`Invalid ${_description}`);
    const response = await createPoint(company.id, overrides);
    expect(response.statusCode).toBe(400);
  });

  it('requires a retention deadline for person-linked or unknown contact data', async () => {
    const company = await createCompany('Retention Required');
    const contact = await createPerson(company.id, 'Retention Person');
    const response = await createPoint(company.id, {
      contactId: contact.id,
      classification: 'PERSON_WORK',
      value: `retention-${RUN_ID}@example.com`,
      dataProcessingBasis: 'LEGITIMATE_INTEREST',
      noticeStatus: 'PENDING'
    });
    expect(response.statusCode).toBe(400);
  });

  it('does not treat a public source as permission and denies the default gate', async () => {
    const company = await createCompany('Public Is Not Permission');
    const pointResponse = await createPoint(company.id, { value: `public-${RUN_ID}@example.com` });
    const point = payload<{ id: string; sourceIsPublic: boolean }>(pointResponse);
    expect(point.sourceIsPublic).toBe(true);

    const response = await gate(point.id);
    expect(response.statusCode).toBe(200);
    expect(payload<{ allowed: boolean; reasons: string[]; actualSendPerformed: boolean }>(response)).toEqual(
      expect.objectContaining({
        allowed: false,
        actualSendPerformed: false,
        reasons: expect.arrayContaining(['CONTACT_POINT_NOT_VERIFIED', 'NO_ALLOWED_PERMISSION'])
      })
    );
  });

  it('allows only a verified, sufficiently confident point with a reviewed ALLOWED receipt', async () => {
    const company = await createCompany('Allowed Dry Run');
    const pointResponse = await createPoint(company.id, { value: `allow-${RUN_ID}@example.com` });
    const point = payload<{ id: string }>(pointResponse);
    expect((await verifyPoint(point.id)).statusCode).toBe(200);
    expect((await recordPermission(point.id)).statusCode).toBe(201);

    const response = await gate(point.id);
    expect(response.statusCode).toBe(200);
    expect(payload<{ allowed: boolean; decision: string; reasons: string[]; actualSendPerformed: boolean }>(response)).toEqual(
      expect.objectContaining({ allowed: true, decision: 'ALLOW', reasons: [], actualSendPerformed: false })
    );
    expect(await prisma.lead.count({ where: { companyId: company.id } })).toBe(0);
  });

  it('rejects a verification timestamp earlier than collection', async () => {
    const company = await createCompany('Verification Timeline');
    const collectedAt = new Date();
    const pointResponse = await createPoint(company.id, {
      value: `verification-timeline-${RUN_ID}@example.com`,
      collectedAt: collectedAt.toISOString()
    });
    const point = payload<{ id: string }>(pointResponse);

    const response = await server.inject({
      method: 'POST',
      url: `/api/contact-points/${point.id}/verification`,
      payload: {
        status: 'VERIFIED',
        confidence: 0.9,
        reason: 'A verification cannot predate the source observation.',
        verifiedAt: new Date(collectedAt.getTime() - 1_000).toISOString(),
        verifiedBy: 'contact-reviewer'
      }
    });

    expect(response.statusCode).toBe(400);
    expect((await prisma.contactPoint.findUniqueOrThrow({ where: { id: point.id } })).verificationStatus).toBe(
      'UNVERIFIED'
    );

    await expect(
      prisma.contactPoint.update({
        where: { id: point.id },
        data: {
          verificationStatus: 'VERIFIED',
          confidence: 0.9,
          verificationReason: 'Direct DB timeline invariant test.',
          verifiedBy: 'db-reviewer',
          verifiedAt: new Date(collectedAt.getTime() - 1_000)
        }
      })
    ).rejects.toThrow();
  });

  it('denies a verified point below the confidence threshold even with ALLOWED permission', async () => {
    const company = await createCompany('Low Confidence Point');
    const pointResponse = await createPoint(company.id, { value: `low-point-${RUN_ID}@example.com` });
    const point = payload<{ id: string }>(pointResponse);
    await verifyPoint(point.id, 0.6);
    await recordPermission(point.id);

    const response = await gate(point.id);
    expect(payload<{ allowed: boolean; reasons: string[] }>(response)).toEqual(
      expect.objectContaining({ allowed: false, reasons: expect.arrayContaining(['CONTACT_POINT_LOW_CONFIDENCE']) })
    );
  });

  it('denies contact data after its retention deadline', async () => {
    const company = await createCompany('Expired Retention');
    const contact = await createPerson(company.id, 'Expired Person');
    const collectedAt = new Date(Date.now() - 30 * 86_400_000);
    const pointResponse = await createPoint(company.id, {
      contactId: contact.id,
      classification: 'PERSON_WORK',
      value: `expired-retention-${RUN_ID}@example.com`,
      collectedAt: collectedAt.toISOString(),
      retentionUntil: new Date(Date.now() - 86_400_000).toISOString(),
      dataProcessingBasis: 'LEGITIMATE_INTEREST',
      noticeStatus: 'PROVIDED',
      noticeProvidedAt: collectedAt.toISOString()
    });
    const point = payload<{ id: string }>(pointResponse);
    await verifyPoint(point.id);
    await recordPermission(point.id, {
      dataProcessingBasis: 'LEGITIMATE_INTEREST',
      communicationRule: 'OTHER_REVIEWED',
      recipientCategory: 'LEGAL_ENTITY'
    });

    const response = await gate(point.id);
    expect(payload<{ allowed: boolean; reasons: string[] }>(response)).toEqual(
      expect.objectContaining({ allowed: false, reasons: expect.arrayContaining(['RETENTION_EXPIRED']) })
    );
  });

  it('requires explicit consent before PERSONAL contact data can receive ALLOWED status', async () => {
    const company = await createCompany('Personal Consent');
    const contact = await createPerson(company.id, 'Personal Recipient');
    const pointResponse = await createPoint(company.id, {
      contactId: contact.id,
      classification: 'PERSONAL',
      value: `personal-${RUN_ID}@example.com`,
      sourceIsPublic: false,
      dataProcessingBasis: 'CONSENT',
      noticeStatus: 'PROVIDED',
      noticeProvidedAt: new Date().toISOString(),
      retentionUntil: new Date(Date.now() + 30 * 86_400_000).toISOString()
    });
    const point = payload<{ id: string }>(pointResponse);
    await verifyPoint(point.id);

    const unsafe = await recordPermission(point.id, {
      dataProcessingBasis: 'LEGITIMATE_INTEREST',
      communicationRule: 'OTHER_REVIEWED',
      recipientCategory: 'CONSUMER'
    });
    expect(unsafe.statusCode).toBe(409);

    const consented = await recordPermission(point.id, {
      dataProcessingBasis: 'CONSENT',
      communicationRule: 'EXPLICIT_CONSENT',
      recipientCategory: 'CONSUMER',
      consentReference: `consent-${RUN_ID}`
    });
    expect(consented.statusCode).toBe(201);
    expect(payload<{ allowed: boolean }>(await gate(point.id)).allowed).toBe(true);
  });

  it('does not allow a person-work permission receipt to claim NOT_PERSONAL_DATA', async () => {
    const company = await createCompany('Person Basis');
    const contact = await createPerson(company.id, 'Work Recipient');
    const pointResponse = await createPoint(company.id, {
      contactId: contact.id,
      classification: 'PERSON_WORK',
      value: `person-basis-${RUN_ID}@example.com`,
      dataProcessingBasis: 'LEGITIMATE_INTEREST',
      noticeStatus: 'PROVIDED',
      noticeProvidedAt: new Date().toISOString(),
      retentionUntil: new Date(Date.now() + 30 * 86_400_000).toISOString()
    });
    const point = payload<{ id: string }>(pointResponse);
    await verifyPoint(point.id);

    const response = await recordPermission(point.id, {
      dataProcessingBasis: 'NOT_PERSONAL_DATA',
      communicationRule: 'OTHER_REVIEWED',
      recipientCategory: 'LEGAL_ENTITY'
    });
    expect(response.statusCode).toBe(409);
    expect(payload<{ allowed: boolean; reasons: string[] }>(await gate(point.id))).toEqual(
      expect.objectContaining({ allowed: false, reasons: expect.arrayContaining(['NO_ALLOWED_PERMISSION']) })
    );
  });

  it('denies an expired ALLOWED permission receipt', async () => {
    const company = await createCompany('Expired Permission');
    const pointResponse = await createPoint(company.id, { value: `expired-permission-${RUN_ID}@example.com` });
    const point = payload<{ id: string }>(pointResponse);
    await verifyPoint(point.id);
    const checkedAt = new Date(Date.now() - 2 * 86_400_000);
    await recordPermission(point.id, {
      checkedAt: checkedAt.toISOString(),
      expiresAt: new Date(Date.now() - 86_400_000).toISOString()
    });

    const response = await gate(point.id);
    expect(payload<{ allowed: boolean; reasons: string[] }>(response)).toEqual(
      expect.objectContaining({ allowed: false, reasons: expect.arrayContaining(['PERMISSION_EXPIRED']) })
    );
  });

  it('does not allow the Turkish B2B exception to be recorded for another jurisdiction', async () => {
    const company = await createCompany('Jurisdiction Bound');
    const pointResponse = await createPoint(company.id, {
      value: `jurisdiction-${RUN_ID}@example.com`,
      countryCode: 'DE'
    });
    const point = payload<{ id: string }>(pointResponse);
    await verifyPoint(point.id);
    const response = await recordPermission(point.id, { jurisdictionCountry: 'DE' });
    expect(response.statusCode).toBe(400);
  });

  it('rejects an evidence-free opt-out without creating a suppression entry', async () => {
    const company = await createCompany('Evidence Required');
    const normalizedValue = `evidence-required-${RUN_ID}@example.com`;
    const pointResponse = await createPoint(company.id, { value: normalizedValue });
    const point = payload<{ id: string }>(pointResponse);
    const hash = buildRecipientHash('EMAIL', normalizedValue);

    const response = await recordPermission(point.id, {
      status: 'OPTED_OUT',
      dataProcessingBasis: 'UNKNOWN',
      communicationRule: 'UNKNOWN',
      recipientCategory: 'UNKNOWN',
      evidenceUrl: undefined,
      reason: 'This payload intentionally has no evidence receipt.'
    });

    expect(response.statusCode).toBe(400);
    expect(await prisma.communicationPermission.count({ where: { contactPointId: point.id } })).toBe(0);
    expect(await prisma.suppressionEntry.count({ where: { channel: 'EMAIL', recipientHash: hash } })).toBe(0);
  });

  it('makes OPTED_OUT a global, non-bypassable blocker for the same normalized recipient', async () => {
    const normalizedValue = `global-optout-${RUN_ID}@example.com`;
    const companyA = await createCompany('Suppression A');
    const companyB = await createCompany('Suppression B');
    const pointAResponse = await createPoint(companyA.id, { value: normalizedValue });
    const pointBResponse = await createPoint(companyB.id, { value: normalizedValue });
    const pointA = payload<{ id: string }>(pointAResponse);
    const pointB = payload<{ id: string }>(pointBResponse);
    const hash = buildRecipientHash('EMAIL', normalizedValue);
    suppressionHashes.push(hash);

    await recordPermission(pointA.id, {
      status: 'OPTED_OUT',
      dataProcessingBasis: 'UNKNOWN',
      communicationRule: 'UNKNOWN',
      recipientCategory: 'UNKNOWN',
      reason: 'Recipient exercised opt-out.'
    });
    await verifyPoint(pointA.id);
    await recordPermission(pointA.id);
    await verifyPoint(pointB.id);
    await recordPermission(pointB.id);

    const gateA = payload<{ allowed: boolean; reasons: string[] }>(await gate(pointA.id));
    const gateB = payload<{ allowed: boolean; reasons: string[] }>(await gate(pointB.id));
    expect(gateA.allowed).toBe(false);
    expect(gateA.reasons).toEqual(expect.arrayContaining(['GLOBAL_SUPPRESSION', 'OPTED_OUT']));
    expect(gateB.allowed).toBe(false);
    expect(gateB.reasons).toContain('GLOBAL_SUPPRESSION');
    expect(await prisma.suppressionEntry.count({ where: { channel: 'EMAIL', recipientHash: hash } })).toBe(1);
  });

  it('rejects an incompatible channel and DB confidence outside 0..1', async () => {
    const company = await createCompany('Phone Channel');
    const pointResponse = await createPoint(company.id, {
      type: 'PHONE',
      value: '+90 532 123 45 67'
    });
    expect(pointResponse.statusCode).toBe(201);
    const point = payload<{ id: string; normalizedValue: string }>(pointResponse);
    expect(point.normalizedValue).toBe('+905321234567');
    const permission = await recordPermission(point.id);
    expect(permission.statusCode).toBe(400);

    await expect(prisma.contactPoint.update({ where: { id: point.id }, data: { confidence: 1.1 } })).rejects.toThrow();
  });
});
