import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { evaluateCommunicationGate } from './contact-points';
import { prisma } from './prisma';

export const RANKING_ALGORITHM_VERSION = 'deterministic-ranking-v1';
export const MAX_CURRENT_EVIDENCE_AGE_DAYS = 90;
export const MAX_DAILY_ACTION_COMPANIES = 100;

type CommunicationChannel = 'EMAIL' | 'PHONE' | 'SMS' | 'WHATSAPP';
type CommunicationPurpose = 'SALES_OUTREACH' | 'MARKETING' | 'CUSTOMER_SERVICE';

export type RankingContextInput = {
  companyIds: string[];
  targetCountries: string[];
  targetSectors: string[];
  channel: CommunicationChannel;
  purpose: CommunicationPurpose;
  jurisdictionCountry: string;
  policyVersion: string;
  evaluatedAt: Date;
  createdBy: string;
};

export class RankingPolicyError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'RankingPolicyError';
    this.statusCode = statusCode;
  }
}

const rankingReceiptInclude = { company: true } as const;

type CompanyWithRankingInputs = Prisma.CompanyGetPayload<{
  include: { evidences: true; contactPoints: { include: { permissions: true } } };
}>;

function normalizeCountry(value: string): string {
  return value.normalize('NFKC').trim().toUpperCase();
}

function normalizeSector(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

function uniqueSorted(values: string[], normalize: (value: string) => string): string[] {
  return Array.from(new Set(values.map(normalize).filter((value) => value.length > 0))).sort();
}

function hashInput(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function evidenceEffectiveAt(evidence: CompanyWithRankingInputs['evidences'][number]): Date {
  return evidence.observedAt ?? evidence.publishedAt ?? evidence.accessedAt;
}

const CONTACT_POINT_BLOCKERS = new Set([
  'CHANNEL_MISMATCH',
  'CONTACT_POINT_DELETED',
  'RETENTION_EXPIRED',
  'CONTACT_POINT_NOT_VERIFIED',
  'CONTACT_POINT_LOW_CONFIDENCE',
  'CONTACT_CLASSIFICATION_UNKNOWN',
  'COLLECTION_BASIS_UNKNOWN',
  'PRIVACY_NOTICE_PENDING'
]);

function addReason(reasons: string[], reason: string) {
  if (!reasons.includes(reason)) reasons.push(reason);
}

async function computeCompanyReceipt(company: CompanyWithRankingInputs, input: RankingContextInput) {
  const targetCountries = uniqueSorted(input.targetCountries, normalizeCountry);
  const targetSectors = uniqueSorted(input.targetSectors, normalizeSector);
  const jurisdictionCountry = normalizeCountry(input.jurisdictionCountry);
  const evaluatedAt = input.evaluatedAt;
  const reasons: string[] = [];

  const companyCountry = company.country ? normalizeCountry(company.country) : null;
  const companySector = company.sector ? normalizeSector(company.sector) : null;
  const countryMatched = companyCountry !== null && targetCountries.includes(companyCountry);
  const sectorMatched = companySector !== null && targetSectors.includes(companySector);
  const icpFitScore = (countryMatched ? 10 : 0) + (sectorMatched ? 10 : 0);
  addReason(reasons, countryMatched ? 'ICP_COUNTRY_MATCH' : companyCountry ? 'ICP_COUNTRY_NO_MATCH' : 'ICP_COUNTRY_MISSING');
  addReason(reasons, sectorMatched ? 'ICP_SECTOR_MATCH' : companySector ? 'ICP_SECTOR_NO_MATCH' : 'ICP_SECTOR_MISSING');

  const companyConfidenceScore = Math.max(0, Math.min(20, Math.round(company.confidence * 20)));
  if (company.confidence < 0.7) addReason(reasons, 'COMPANY_CONFIDENCE_BELOW_ACTION_THRESHOLD');

  const maxEvidenceAgeMs = MAX_CURRENT_EVIDENCE_AGE_DAYS * 86_400_000;
  const evidenceReceipt = company.evidences
    .map((evidence) => {
      const effectiveAt = evidenceEffectiveAt(evidence);
      const exclusionReasons: string[] = [];
      if (evidence.accessedAt > evaluatedAt || effectiveAt > evaluatedAt) exclusionReasons.push('FUTURE_EVIDENCE');
      if (evidence.freshnessStatus === 'STALE') exclusionReasons.push('STALE_EVIDENCE');
      if (evidence.freshnessStatus === 'UNKNOWN') exclusionReasons.push('UNKNOWN_FRESHNESS');
      if (evidence.confidence < 0.7) exclusionReasons.push('LOW_CONFIDENCE_EVIDENCE');
      if (evaluatedAt.getTime() - effectiveAt.getTime() > maxEvidenceAgeMs) exclusionReasons.push('EVIDENCE_TOO_OLD');
      return {
        id: evidence.id,
        sourceUrl: evidence.sourceUrl,
        claimKey: evidence.claimKey ?? null,
        accessedAt: evidence.accessedAt.toISOString(),
        effectiveAt: effectiveAt.toISOString(),
        freshnessStatus: evidence.freshnessStatus,
        confidence: evidence.confidence,
        qualified: exclusionReasons.length === 0 && evidence.freshnessStatus === 'CURRENT',
        exclusionReasons
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));

  for (const receipt of evidenceReceipt) {
    for (const reason of receipt.exclusionReasons) addReason(reasons, `${reason}_IGNORED`);
  }
  const qualifiedEvidence = evidenceReceipt.filter((receipt) => receipt.qualified);
  const distinctClaims = new Set(
    qualifiedEvidence.map((receipt) => normalizeSector(receipt.claimKey ?? receipt.sourceUrl))
  ).size;
  const averageEvidenceConfidence =
    qualifiedEvidence.length === 0
      ? 0
      : qualifiedEvidence.reduce((sum, receipt) => sum + receipt.confidence, 0) / qualifiedEvidence.length;
  const evidenceScore =
    qualifiedEvidence.length === 0
      ? 0
      : Math.min(20, Math.round(averageEvidenceConfidence * 10) + Math.min(2, distinctClaims) * 5);
  if (qualifiedEvidence.length === 0) addReason(reasons, 'NO_QUALIFIED_CURRENT_EVIDENCE');
  else addReason(reasons, qualifiedEvidence.length >= 2 ? 'MULTIPLE_CURRENT_EVIDENCE_SIGNALS' : 'ONE_CURRENT_EVIDENCE_SIGNAL');

  const contactReceipt: Array<{
    contactPointId: string;
    classification: string;
    verificationStatus: string;
    confidence: number;
    sourceUrl: string;
    collectedAt: string;
    observedAt: string | null;
    verifiedAt: string | null;
    retentionUntil: string | null;
    noticeStatus: string;
    dataProcessingBasis: string;
    gateDecision: 'ALLOW' | 'DENY';
    gateReasons: string[];
    permissionId: string | null;
    permissionCheckedAt: string | null;
    permissionExpiresAt: string | null;
    permissionStatus: string | null;
    communicationRule: string | null;
    actualSendPerformed: false;
  }> = [];
  for (const contactPoint of [...company.contactPoints].sort((left, right) => left.id.localeCompare(right.id))) {
    const gate = await evaluateCommunicationGate({
      contactPointId: contactPoint.id,
      channel: input.channel,
      purpose: input.purpose,
      jurisdictionCountry,
      evaluatedAt
    });
    const selectedPermission = gate.permissionId
      ? contactPoint.permissions.find((permission) => permission.id === gate.permissionId)
      : null;
    contactReceipt.push({
      contactPointId: contactPoint.id,
      classification: contactPoint.classification,
      verificationStatus: contactPoint.verificationStatus,
      confidence: contactPoint.confidence,
      sourceUrl: contactPoint.sourceUrl,
      collectedAt: contactPoint.collectedAt.toISOString(),
      observedAt: contactPoint.observedAt?.toISOString() ?? null,
      verifiedAt: contactPoint.verifiedAt?.toISOString() ?? null,
      retentionUntil: contactPoint.retentionUntil?.toISOString() ?? null,
      noticeStatus: contactPoint.noticeStatus,
      dataProcessingBasis: contactPoint.dataProcessingBasis,
      gateDecision: gate.decision,
      gateReasons: gate.reasons,
      permissionId: gate.permissionId,
      permissionCheckedAt: selectedPermission?.checkedAt.toISOString() ?? null,
      permissionExpiresAt: selectedPermission?.expiresAt?.toISOString() ?? null,
      permissionStatus: selectedPermission?.status ?? null,
      communicationRule: selectedPermission?.communicationRule ?? null,
      actualSendPerformed: false
    });
  }

  const eligibleContacts = contactReceipt.filter(
    (receipt) => !receipt.gateReasons.some((reason) => CONTACT_POINT_BLOCKERS.has(reason))
  );
  const allowedContacts = contactReceipt.filter((receipt) => receipt.gateDecision === 'ALLOW');
  const contactScore = eligibleContacts.length > 0 ? 20 : 0;
  const permissionScore = allowedContacts.length > 0 ? 20 : 0;
  if (contactReceipt.length === 0) addReason(reasons, 'NO_CONTACT_POINT');
  else if (eligibleContacts.length === 0) addReason(reasons, 'NO_VERIFIED_CONTACT_FOR_CHANNEL');
  else addReason(reasons, 'VERIFIED_CONTACT_FOR_CHANNEL');
  if (allowedContacts.length === 0) addReason(reasons, 'NO_ALLOWED_COMMUNICATION_PERMISSION');
  else addReason(reasons, 'HUMAN_OUTREACH_REVIEW_ELIGIBLE');
  if (contactReceipt.some((receipt) => receipt.gateReasons.includes('GLOBAL_SUPPRESSION'))) {
    addReason(reasons, 'GLOBAL_SUPPRESSION_PRESENT');
  }
  const suppressionPresent = contactReceipt.some((receipt) =>
    receipt.gateReasons.some((reason) => ['GLOBAL_SUPPRESSION', 'OPTED_OUT', 'SUPPRESSED'].includes(reason))
  );

  const nextAction =
    suppressionPresent
      ? ('HONOR_SUPPRESSION' as const)
      : company.confidence < 0.7
      ? ('VERIFY_COMPANY' as const)
      : qualifiedEvidence.length === 0
        ? ('COLLECT_EVIDENCE' as const)
        : eligibleContacts.length === 0
          ? ('VERIFY_CONTACT_POINT' as const)
          : allowedContacts.length === 0
            ? ('REVIEW_COMMUNICATION_PERMISSION' as const)
            : ('READY_FOR_HUMAN_OUTREACH_REVIEW' as const);

  const totalScore = icpFitScore + companyConfidenceScore + evidenceScore + contactScore + permissionScore;
  const context = {
    targetCountries,
    targetSectors,
    channel: input.channel,
    purpose: input.purpose,
    jurisdictionCountry,
    policyVersion: input.policyVersion,
    evaluatedAt: evaluatedAt.toISOString(),
    maxCurrentEvidenceAgeDays: MAX_CURRENT_EVIDENCE_AGE_DAYS
  };
  const canonicalInput = {
    algorithmVersion: RANKING_ALGORITHM_VERSION,
    context,
    company: {
      id: company.id,
      status: company.status,
      mergedIntoId: company.mergedIntoId ?? null,
      country: companyCountry,
      sector: companySector,
      confidence: company.confidence
    },
    evidenceReceipt,
    contactReceipt
  };

  return {
    algorithmVersion: RANKING_ALGORITHM_VERSION,
    policyVersion: input.policyVersion,
    inputHash: hashInput(canonicalInput),
    context,
    evidenceReceipt,
    contactReceipt,
    icpFitScore,
    companyConfidenceScore,
    evidenceScore,
    contactScore,
    permissionScore,
    totalScore,
    reasonCodes: reasons,
    nextAction,
    evaluatedAt,
    createdBy: input.createdBy
  };
}

export async function recordCompanyRanking(companyId: string, input: RankingContextInput) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: { evidences: true, contactPoints: { include: { permissions: true } } }
  });
  if (!company) throw new RankingPolicyError(404, 'Company not found');
  if (company.status !== 'ACTIVE' || company.mergedIntoId) {
    throw new RankingPolicyError(409, 'Only active canonical companies can be ranked');
  }

  const computed = await computeCompanyReceipt(company, input);
  const uniqueWhere = {
    companyId_algorithmVersion_inputHash: {
      companyId,
      algorithmVersion: computed.algorithmVersion,
      inputHash: computed.inputHash
    }
  };
  const existing = await prisma.companyRankingReceipt.findUnique({ where: uniqueWhere, include: rankingReceiptInclude });
  if (existing) return existing;

  try {
    const receiptId = await prisma.$transaction(async (tx) => {
      const receipt = await tx.companyRankingReceipt.create({
        data: {
          companyId,
          ...computed,
          context: computed.context,
          evidenceReceipt: computed.evidenceReceipt,
          contactReceipt: computed.contactReceipt,
          reasonCodes: computed.reasonCodes
        }
      });
      await tx.event.create({
        data: {
          type: 'COMPANY_RANKING_RECORDED',
          entityType: 'Company',
          entityId: companyId,
          actor: input.createdBy,
          metadata: {
            rankingReceiptId: receipt.id,
            algorithmVersion: computed.algorithmVersion,
            policyVersion: computed.policyVersion,
            inputHash: computed.inputHash,
            totalScore: computed.totalScore,
            nextAction: computed.nextAction,
            actualLeadCreated: false,
            actualOutreachCreated: false,
            actualSendPerformed: false
          }
        }
      });
      return receipt.id;
    });
    return prisma.companyRankingReceipt.findUniqueOrThrow({
      where: { id: receiptId },
      include: rankingReceiptInclude
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return prisma.companyRankingReceipt.findUniqueOrThrow({ where: uniqueWhere, include: rankingReceiptInclude });
    }
    throw error;
  }
}

export async function refreshDailyActions(input: RankingContextInput) {
  const companyIds = uniqueSorted(input.companyIds, (value) => value.trim());
  if (companyIds.length === 0 || companyIds.length > MAX_DAILY_ACTION_COMPANIES) {
    throw new RankingPolicyError(400, `companyIds must contain 1..${MAX_DAILY_ACTION_COMPANIES} unique values`);
  }
  if (uniqueSorted(input.targetCountries, normalizeCountry).length === 0) {
    throw new RankingPolicyError(400, 'targetCountries must contain at least one value');
  }
  if (uniqueSorted(input.targetSectors, normalizeSector).length === 0) {
    throw new RankingPolicyError(400, 'targetSectors must contain at least one value');
  }
  const companies = await prisma.company.findMany({
    where: { id: { in: companyIds } },
    select: { id: true, status: true, mergedIntoId: true }
  });
  const rankableIds = new Set(
    companies.filter((company) => company.status === 'ACTIVE' && !company.mergedIntoId).map((company) => company.id)
  );
  const invalidIds = companyIds.filter((id) => !rankableIds.has(id));
  if (invalidIds.length > 0) {
    throw new RankingPolicyError(409, `Missing, inactive, or merged companies cannot be ranked: ${invalidIds.join(', ')}`);
  }

  const receipts: Array<Awaited<ReturnType<typeof recordCompanyRanking>>> = [];
  for (const companyId of companyIds) receipts.push(await recordCompanyRanking(companyId, input));
  return receipts.sort(
    (left, right) =>
      right.totalScore - left.totalScore ||
      left.company.normalizedName.localeCompare(right.company.normalizedName) ||
      left.companyId.localeCompare(right.companyId)
  );
}

export async function listCompanyRankingReceipts(companyId: string, limit = 50) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new RankingPolicyError(400, 'limit must be an integer from 1 to 100');
  }
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true } });
  if (!company) throw new RankingPolicyError(404, 'Company not found');
  return prisma.companyRankingReceipt.findMany({
    where: { companyId },
    include: rankingReceiptInclude,
    take: limit,
    orderBy: [{ evaluatedAt: 'desc' }, { createdAt: 'desc' }]
  });
}
