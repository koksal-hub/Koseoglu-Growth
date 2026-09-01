import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { normalizeEmail, normalizePhone } from './entity-resolution';
import { prisma } from './prisma';

export const MIN_SENDABLE_CONTACT_CONFIDENCE = 0.7;

export class ContactPolicyError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'ContactPolicyError';
    this.statusCode = statusCode;
  }
}

type ContactPointType = 'EMAIL' | 'PHONE';
type ContactPointClassification = 'COMPANY_GENERAL' | 'PERSON_WORK' | 'PERSONAL' | 'UNKNOWN';
type VerificationStatus = 'VERIFIED' | 'INVALID' | 'STALE';
type NoticeStatus = 'NOT_REQUIRED' | 'PENDING' | 'PROVIDED' | 'EXEMPTION_RECORDED';
type DataProcessingBasis =
  | 'CONSENT'
  | 'CONTRACT'
  | 'LEGAL_OBLIGATION'
  | 'LEGITIMATE_INTEREST'
  | 'PUBLIC_INTEREST'
  | 'VITAL_INTEREST'
  | 'PUBLICIZED_BY_DATA_SUBJECT'
  | 'LEGAL_CLAIM'
  | 'NOT_PERSONAL_DATA'
  | 'UNKNOWN';
type CommunicationChannel = 'EMAIL' | 'PHONE' | 'SMS' | 'WHATSAPP';
type CommunicationPurpose = 'SALES_OUTREACH' | 'MARKETING' | 'CUSTOMER_SERVICE';
type PermissionStatus = 'ALLOWED' | 'DENIED' | 'OPTED_OUT' | 'SUPPRESSED';
type CommunicationRule =
  | 'EXPLICIT_CONSENT'
  | 'EXISTING_CUSTOMER'
  | 'B2B_RECIPIENT_EXCEPTION'
  | 'SOFT_OPT_IN'
  | 'OTHER_REVIEWED'
  | 'UNKNOWN';
type RecipientCategory = 'LEGAL_ENTITY' | 'TRADER_OR_CRAFTSMAN' | 'CONSUMER' | 'UNKNOWN';

export type CreateContactPointInput = {
  companyId: string;
  contactId?: string;
  type: ContactPointType;
  classification: ContactPointClassification;
  value: string;
  countryCode: string;
  sourceUrl: string;
  sourceName?: string;
  sourceIsPublic: boolean;
  collectedAt: Date;
  observedAt?: Date;
  confidence: number;
  collectionPurpose: string;
  dataProcessingBasis: DataProcessingBasis;
  noticeStatus: NoticeStatus;
  noticeProvidedAt?: Date;
  retentionUntil?: Date;
  actor: string;
};

export type VerifyContactPointInput = {
  contactPointId: string;
  status: VerificationStatus;
  confidence: number;
  reason: string;
  verifiedBy: string;
  verifiedAt?: Date;
};

export type RecordPermissionInput = {
  contactPointId: string;
  channel: CommunicationChannel;
  purpose: CommunicationPurpose;
  jurisdictionCountry: string;
  status: PermissionStatus;
  dataProcessingBasis: DataProcessingBasis;
  communicationRule: CommunicationRule;
  recipientCategory: RecipientCategory;
  consentReference?: string;
  evidenceUrl?: string;
  policyVersion: string;
  checkedAt: Date;
  expiresAt?: Date;
  reviewedBy: string;
  reason: string;
};

export type CommunicationGateInput = {
  contactPointId: string;
  channel: CommunicationChannel;
  purpose: CommunicationPurpose;
  jurisdictionCountry: string;
  evaluatedAt?: Date;
};

const contactPointInclude = {
  contact: true,
  permissions: { orderBy: [{ checkedAt: 'desc' as const }, { createdAt: 'desc' as const }] }
};

type ContactPointDatabase = Prisma.TransactionClient | typeof prisma;

export function normalizeContactPointValue(type: ContactPointType, raw: string): string {
  if (type === 'EMAIL') {
    const email = normalizeEmail(raw);
    const [local = '', domain = '', ...extraParts] = email?.split('@') ?? [];
    const domainLabels = domain.split('.');
    const emailIsValid =
      Boolean(email) &&
      email!.length <= 254 &&
      extraParts.length === 0 &&
      local.length > 0 &&
      local.length <= 64 &&
      !local.startsWith('.') &&
      !local.endsWith('.') &&
      !local.includes('..') &&
      /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local) &&
      domain.length <= 253 &&
      domainLabels.length >= 2 &&
      domainLabels.every(
        (label) => label.length > 0 && label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label)
      );
    if (!email || !emailIsValid) {
      throw new ContactPolicyError(400, 'A valid email address is required');
    }
    return email;
  }

  const trimmed = raw.trim();
  const phone = /^\+[0-9][0-9\s().-]*$/.test(trimmed) ? normalizePhone(trimmed) : null;
  if (!phone || !/^\+[1-9]\d{7,14}$/.test(phone)) {
    throw new ContactPolicyError(400, 'Phone numbers must use E.164 format');
  }
  return phone;
}

export function buildRecipientHash(channel: CommunicationChannel, normalizedValue: string): string {
  return createHash('sha256').update(`${channel}:${normalizedValue}`).digest('hex');
}

function assertOwnershipShape(classification: ContactPointClassification, contactId?: string) {
  if (classification === 'COMPANY_GENERAL' && contactId) {
    throw new ContactPolicyError(400, 'A company-general contact point cannot reference a person');
  }
  if ((classification === 'PERSON_WORK' || classification === 'PERSONAL') && !contactId) {
    throw new ContactPolicyError(400, 'A person contact point must reference a Contact');
  }
}

function supportsChannel(type: ContactPointType, channel: CommunicationChannel): boolean {
  return type === 'EMAIL' ? channel === 'EMAIL' : channel !== 'EMAIL';
}

export async function getContactPoint(id: string, database: ContactPointDatabase = prisma) {
  const contactPoint = await database.contactPoint.findUnique({ where: { id }, include: contactPointInclude });
  if (!contactPoint) throw new ContactPolicyError(404, 'Contact point not found');
  return contactPoint;
}

export async function listCompanyContactPoints(companyId: string) {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true } });
  if (!company) throw new ContactPolicyError(404, 'Company not found');
  return prisma.contactPoint.findMany({
    where: { companyId },
    include: contactPointInclude,
    orderBy: { createdAt: 'asc' }
  });
}

export async function createContactPoint(input: CreateContactPointInput) {
  const company = await prisma.company.findUnique({ where: { id: input.companyId } });
  if (!company || company.status !== 'ACTIVE') throw new ContactPolicyError(404, 'Active company not found');

  assertOwnershipShape(input.classification, input.contactId);
  if (input.contactId) {
    const contact = await prisma.contact.findUnique({ where: { id: input.contactId } });
    if (!contact || contact.companyId !== input.companyId) {
      throw new ContactPolicyError(409, 'Contact does not belong to the selected company');
    }
  }
  if (input.classification !== 'COMPANY_GENERAL' && !input.retentionUntil) {
    throw new ContactPolicyError(400, 'Personal or unknown contact data requires a retention deadline');
  }
  if (input.classification !== 'COMPANY_GENERAL' && input.dataProcessingBasis === 'NOT_PERSONAL_DATA') {
    throw new ContactPolicyError(400, 'Person-linked contact data cannot use NOT_PERSONAL_DATA');
  }

  const normalizedValue = normalizeContactPointValue(input.type, input.value);

  try {
    const contactPointId = await prisma.$transaction(async (tx) => {
      const contactPoint = await tx.contactPoint.create({
        data: {
          companyId: input.companyId,
          contactId: input.contactId,
          type: input.type,
          classification: input.classification,
          normalizedValue,
          countryCode: input.countryCode,
          sourceUrl: input.sourceUrl,
          sourceName: input.sourceName,
          sourceIsPublic: input.sourceIsPublic,
          collectedAt: input.collectedAt,
          observedAt: input.observedAt,
          confidence: input.confidence,
          collectionPurpose: input.collectionPurpose,
          dataProcessingBasis: input.dataProcessingBasis,
          noticeStatus: input.noticeStatus,
          noticeProvidedAt: input.noticeProvidedAt,
          retentionUntil: input.retentionUntil
        }
      });

      await tx.event.create({
        data: {
          type: 'CONTACT_POINT_COLLECTED',
          entityType: 'ContactPoint',
          entityId: contactPoint.id,
          actor: input.actor,
          metadata: {
            companyId: input.companyId,
            contactId: input.contactId ?? null,
            type: input.type,
            classification: input.classification,
            sourceIsPublic: input.sourceIsPublic,
            automaticallySendable: false
          }
        }
      });
      return contactPoint.id;
    });
    return getContactPoint(contactPointId);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ContactPolicyError(409, 'This normalized contact point already exists for the company');
    }
    throw error;
  }
}

export async function verifyContactPoint(input: VerifyContactPointInput) {
  const existing = await getContactPoint(input.contactPointId);
  if (existing.deletedAt) throw new ContactPolicyError(409, 'Deleted contact data cannot be verified');
  const verifiedAt = input.verifiedAt ?? new Date();
  if (verifiedAt < existing.collectedAt) {
    throw new ContactPolicyError(400, 'Verification time cannot be earlier than collection time');
  }

  await prisma.$transaction(async (tx) => {
    await tx.contactPoint.update({
      where: { id: input.contactPointId },
      data: {
        verificationStatus: input.status,
        confidence: input.confidence,
        verificationReason: input.reason,
        verifiedBy: input.verifiedBy,
        verifiedAt
      }
    });
    await tx.event.create({
      data: {
        type: 'CONTACT_POINT_VERIFIED',
        entityType: 'ContactPoint',
        entityId: input.contactPointId,
        actor: input.verifiedBy,
        metadata: { status: input.status, confidence: input.confidence, reason: input.reason }
      }
    });
  });
  return getContactPoint(input.contactPointId);
}

function validatePermissionReceipt(
  contactPoint: Awaited<ReturnType<typeof getContactPoint>>,
  input: RecordPermissionInput
) {
  if (!supportsChannel(contactPoint.type, input.channel)) {
    throw new ContactPolicyError(400, 'Communication channel is incompatible with the contact point type');
  }
  if (input.status === 'ALLOWED') {
    if (
      input.dataProcessingBasis === 'UNKNOWN' ||
      input.communicationRule === 'UNKNOWN' ||
      !input.evidenceUrl
    ) {
      throw new ContactPolicyError(400, 'ALLOWED requires reviewed legal basis, communication rule, and evidence');
    }
    if (contactPoint.classification === 'UNKNOWN') {
      throw new ContactPolicyError(409, 'Unknown contact classification cannot be allowed');
    }
    if (contactPoint.classification !== 'COMPANY_GENERAL' && input.dataProcessingBasis === 'NOT_PERSONAL_DATA') {
      throw new ContactPolicyError(409, 'Person-linked communication cannot use NOT_PERSONAL_DATA');
    }
    if (
      contactPoint.classification !== 'COMPANY_GENERAL' &&
      !['PROVIDED', 'EXEMPTION_RECORDED'].includes(contactPoint.noticeStatus)
    ) {
      throw new ContactPolicyError(409, 'Person-linked contact data requires a privacy notice receipt or exemption');
    }
    if (
      contactPoint.classification === 'PERSONAL' &&
      (input.dataProcessingBasis !== 'CONSENT' || input.communicationRule !== 'EXPLICIT_CONSENT')
    ) {
      throw new ContactPolicyError(409, 'Personal contact data requires explicit consent');
    }
  }
  if (input.communicationRule === 'EXPLICIT_CONSENT' && !input.consentReference) {
    throw new ContactPolicyError(400, 'Explicit consent requires a consent reference');
  }
  if (input.status !== 'DENIED' && !input.evidenceUrl) {
    throw new ContactPolicyError(400, 'ALLOWED, OPTED_OUT, and SUPPRESSED decisions require evidence');
  }
  if (input.communicationRule === 'B2B_RECIPIENT_EXCEPTION') {
    if (input.recipientCategory !== 'TRADER_OR_CRAFTSMAN') {
      throw new ContactPolicyError(400, 'B2B recipient exception requires a trader-or-craftsman receipt');
    }
    if (input.jurisdictionCountry !== 'TR') {
      throw new ContactPolicyError(400, 'B2B recipient exception is restricted to reviewed Turkish jurisdiction');
    }
  }
}

export async function recordCommunicationPermission(input: RecordPermissionInput) {
  const contactPoint = await getContactPoint(input.contactPointId);
  validatePermissionReceipt(contactPoint, input);
  const createsSuppression = input.status === 'OPTED_OUT' || input.status === 'SUPPRESSED';
  const recipientHash = buildRecipientHash(input.channel, contactPoint.normalizedValue);

  const permissionId = await prisma.$transaction(async (tx) => {
    // Approval decisions take the same row lock before re-evaluating the gate.
    // This prevents an application-path opt-out from racing an approval.
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "ContactPoint" WHERE "id" = ${input.contactPointId} FOR UPDATE`
    );
    const permission = await tx.communicationPermission.create({
      data: {
        contactPointId: input.contactPointId,
        channel: input.channel,
        purpose: input.purpose,
        jurisdictionCountry: input.jurisdictionCountry,
        status: input.status,
        dataProcessingBasis: input.dataProcessingBasis,
        communicationRule: input.communicationRule,
        recipientCategory: input.recipientCategory,
        consentReference: input.consentReference,
        evidenceUrl: input.evidenceUrl,
        policyVersion: input.policyVersion,
        checkedAt: input.checkedAt,
        expiresAt: input.expiresAt,
        reviewedBy: input.reviewedBy,
        reason: input.reason
      }
    });

    await tx.event.create({
      data: {
        type: 'COMMUNICATION_PERMISSION_RECORDED',
        entityType: 'ContactPoint',
        entityId: input.contactPointId,
        actor: input.reviewedBy,
        metadata: {
          permissionId: permission.id,
          channel: input.channel,
          purpose: input.purpose,
          jurisdictionCountry: input.jurisdictionCountry,
          status: input.status,
          policyVersion: input.policyVersion,
          actualSendPerformed: false
        }
      }
    });

    if (createsSuppression) {
      await tx.suppressionEntry.upsert({
        where: { channel_recipientHash: { channel: input.channel, recipientHash } },
        update: {},
        create: {
          channel: input.channel,
          recipientHash,
          reason: input.reason,
          source: 'COMMUNICATION_PERMISSION',
          recordedBy: input.reviewedBy
        }
      });
      await tx.event.create({
        data: {
          type: 'COMMUNICATION_SUPPRESSED',
          entityType: 'ContactPoint',
          entityId: input.contactPointId,
          actor: input.reviewedBy,
          metadata: { channel: input.channel, status: input.status, recipientHashStored: true }
        }
      });
    }
    return permission.id;
  });

  return prisma.communicationPermission.findUniqueOrThrow({ where: { id: permissionId } });
}

export async function evaluateCommunicationGate(
  input: CommunicationGateInput,
  database: ContactPointDatabase = prisma
) {
  const evaluatedAt = input.evaluatedAt ?? new Date();
  const contactPoint = await getContactPoint(input.contactPointId, database);
  const reasons: string[] = [];

  if (!supportsChannel(contactPoint.type, input.channel)) reasons.push('CHANNEL_MISMATCH');
  if (contactPoint.deletedAt) reasons.push('CONTACT_POINT_DELETED');
  if (contactPoint.retentionUntil && contactPoint.retentionUntil <= evaluatedAt) reasons.push('RETENTION_EXPIRED');
  if (contactPoint.verificationStatus !== 'VERIFIED') reasons.push('CONTACT_POINT_NOT_VERIFIED');
  if (contactPoint.confidence < MIN_SENDABLE_CONTACT_CONFIDENCE) reasons.push('CONTACT_POINT_LOW_CONFIDENCE');
  if (contactPoint.classification === 'UNKNOWN') reasons.push('CONTACT_CLASSIFICATION_UNKNOWN');
  if (contactPoint.dataProcessingBasis === 'UNKNOWN') reasons.push('COLLECTION_BASIS_UNKNOWN');
  if (
    contactPoint.classification !== 'COMPANY_GENERAL' &&
    !['PROVIDED', 'EXEMPTION_RECORDED'].includes(contactPoint.noticeStatus)
  ) {
    reasons.push('PRIVACY_NOTICE_PENDING');
  }

  const recipientHash = buildRecipientHash(input.channel, contactPoint.normalizedValue);
  const globalSuppression = await database.suppressionEntry.findUnique({
    where: { channel_recipientHash: { channel: input.channel, recipientHash } }
  });
  if (globalSuppression) reasons.push('GLOBAL_SUPPRESSION');

  const permanentBlock = contactPoint.permissions.find(
    (permission) =>
      permission.channel === input.channel &&
      (permission.status === 'OPTED_OUT' || permission.status === 'SUPPRESSED')
  );
  if (permanentBlock) reasons.push(permanentBlock.status);

  const relevant = contactPoint.permissions.filter(
    (permission) =>
      permission.channel === input.channel &&
      permission.purpose === input.purpose &&
      permission.jurisdictionCountry === input.jurisdictionCountry &&
      permission.checkedAt <= evaluatedAt
  );
  const latest = relevant[0];
  let permissionId: string | null = null;
  if (!latest) {
    reasons.push('NO_ALLOWED_PERMISSION');
  } else if (latest.status !== 'ALLOWED') {
    reasons.push(latest.status === 'DENIED' ? 'PERMISSION_DENIED' : latest.status);
  } else {
    permissionId = latest.id;
    if (latest.expiresAt && latest.expiresAt <= evaluatedAt) reasons.push('PERMISSION_EXPIRED');
    if (
      contactPoint.classification === 'PERSONAL' &&
      (latest.dataProcessingBasis !== 'CONSENT' || latest.communicationRule !== 'EXPLICIT_CONSENT')
    ) {
      reasons.push('PERSONAL_REQUIRES_EXPLICIT_CONSENT');
    }
    if (contactPoint.classification !== 'COMPANY_GENERAL' && latest.dataProcessingBasis === 'NOT_PERSONAL_DATA') {
      reasons.push('PERSON_CONTACT_REQUIRES_PERSONAL_DATA_BASIS');
    }
  }

  return {
    allowed: reasons.length === 0,
    decision: reasons.length === 0 ? ('ALLOW' as const) : ('DENY' as const),
    reasons: Array.from(new Set(reasons)),
    contactPointId: contactPoint.id,
    channel: input.channel,
    purpose: input.purpose,
    jurisdictionCountry: input.jurisdictionCountry,
    permissionId,
    evaluatedAt,
    actualSendPerformed: false
  };
}
