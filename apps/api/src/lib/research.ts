import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import {
  findDuplicateCompany,
  normalizeCompanyName,
  normalizeDomain,
  normalizePhone,
  normalizeTaxNumber
} from './entity-resolution';
import {
  countIndependentResearchSources,
  extractResearchSignals,
  researchSourceOrigin
} from './research-extraction';

export const MIN_ACCEPTANCE_CONFIDENCE = 0.7;
export const MIN_INDEPENDENT_RESEARCH_SOURCES = 2;
export const MAX_RESEARCH_ACTIONS = 100;

export type ResearchMissionActionType =
  | 'VERIFY_CANDIDATE'
  | 'COLLECT_EVIDENCE'
  | 'COLLECT_CONTACT_SIGNAL'
  | 'REVIEW_CANDIDATE_DECISION';

const RESEARCH_ACTION_PRIORITY: Record<ResearchMissionActionType, number> = {
  VERIFY_CANDIDATE: 10,
  COLLECT_EVIDENCE: 20,
  COLLECT_CONTACT_SIGNAL: 30,
  REVIEW_CANDIDATE_DECISION: 40
};

export class ResearchWorkflowError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'ResearchWorkflowError';
    this.statusCode = statusCode;
  }
}

export type CreateResearchMissionInput = {
  name: string;
  scope: string;
  country?: string;
  region?: string;
  sector?: string;
  route?: string;
  budgetLimit?: string;
  budgetCurrency?: string;
  owner: string;
};

export type ResearchCompanyProposal = {
  name: string;
  taxNumber?: string;
  domain?: string;
  phone?: string;
  emailDomain?: string;
  country?: string;
  city?: string;
  address?: string;
  sector?: string;
  activity?: string;
  website?: string;
};

export type ResearchEvidenceInput = {
  sourceUrl: string;
  sourceName?: string;
  publishedAt?: Date;
  accessedAt: Date;
  observedAt?: Date;
  claimKey?: string;
  freshnessStatus?: 'CURRENT' | 'STALE' | 'UNKNOWN';
  legalNotes?: string;
  summary: string;
  confidence: number;
};

export type AddResearchCandidateInput = {
  missionId: string;
  company: ResearchCompanyProposal;
  reason: string;
  confidence: number;
  evidence: ResearchEvidenceInput;
  actor: string;
  metadata?: Record<string, unknown>;
};

export type DecideResearchCandidateInput = {
  candidateId: string;
  decision: 'ACCEPT' | 'REJECT' | 'REQUEST_MORE_EVIDENCE';
  reason: string;
  decidedBy: string;
  resolution?: 'LINK_MATCH' | 'CREATE_NEW';
};

export type AddResearchEvidenceInput = {
  candidateId: string;
  evidence: ResearchEvidenceInput;
  actor: string;
};

export type DiscoverResearchCandidateInput = {
  missionId: string;
  sourceUrl: string;
  sourceName?: string;
  accessedAt: Date;
  content: string;
  actor: string;
};

const missionInclude = {
  candidates: {
    include: {
      evidences: { orderBy: { createdAt: 'asc' as const } },
      company: true,
      matchedCompany: true
    },
    orderBy: { createdAt: 'asc' as const }
  }
};

export async function createResearchMission(input: CreateResearchMissionInput) {
  return prisma.$transaction(async (tx) => {
    const mission = await tx.researchMission.create({
      data: {
        name: input.name,
        scope: input.scope,
        country: input.country,
        region: input.region,
        sector: input.sector,
        route: input.route,
        budgetLimit: input.budgetLimit ? new Prisma.Decimal(input.budgetLimit) : undefined,
        budgetCurrency: input.budgetCurrency,
        owner: input.owner
      }
    });

    await tx.event.create({
      data: {
        type: 'RESEARCH_MISSION_CREATED',
        entityType: 'ResearchMission',
        entityId: mission.id,
        actor: input.owner,
        metadata: { status: mission.status }
      }
    });

    return mission;
  });
}

export async function listResearchMissions() {
  return prisma.researchMission.findMany({
    include: { _count: { select: { candidates: true } } },
    orderBy: { createdAt: 'desc' }
  });
}

export async function getResearchMission(id: string) {
  const mission = await prisma.researchMission.findUnique({ where: { id }, include: missionInclude });
  if (!mission) throw new ResearchWorkflowError(404, 'Research mission not found');
  return mission;
}

export async function addResearchCandidate(input: AddResearchCandidateInput) {
  const mission = await prisma.researchMission.findUnique({ where: { id: input.missionId } });
  if (!mission) throw new ResearchWorkflowError(404, 'Research mission not found');
  if (mission.status !== 'ACTIVE') {
    throw new ResearchWorkflowError(409, 'Candidates can only be added to an active research mission');
  }

  const normalizedProposal = {
    name: input.company.name.trim(),
    taxNumber: normalizeTaxNumber(input.company.taxNumber),
    domain: normalizeDomain(input.company.domain ?? input.company.website),
    phone: normalizePhone(input.company.phone),
    emailDomain: normalizeDomain(input.company.emailDomain),
    country: input.company.country?.trim(),
    city: input.company.city?.trim(),
    address: input.company.address?.trim(),
    sector: input.company.sector?.trim(),
    activity: input.company.activity?.trim(),
    website: input.company.website?.trim()
  };

  // Deterministic entity resolution happens before any write transaction.
  // A match is only a proposal: the human decision must explicitly link it.
  const existingCompanies = await prisma.company.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      normalizedName: true,
      taxNumber: true,
      domain: true,
      phone: true,
      emailDomain: true,
      address: true
    }
  });
  const match = findDuplicateCompany(normalizedProposal, existingCompanies);

  return prisma.$transaction(async (tx) => {
    const candidate = await tx.researchCandidate.create({
      data: {
        missionId: input.missionId,
        matchedCompanyId: match?.candidate.id,
        proposedName: normalizedProposal.name,
        taxNumber: normalizedProposal.taxNumber,
        domain: normalizedProposal.domain,
        phone: normalizedProposal.phone,
        emailDomain: normalizedProposal.emailDomain,
        country: normalizedProposal.country,
        city: normalizedProposal.city,
        address: normalizedProposal.address,
        sector: normalizedProposal.sector,
        activity: normalizedProposal.activity,
        website: normalizedProposal.website,
        reason: input.reason,
        confidence: input.confidence,
        matchedBy: match?.reason,
        matchConfidence: match?.confidence
      }
    });

    const event = await tx.event.create({
      data: {
        type: 'RESEARCH_CANDIDATE_PROPOSED',
        entityType: 'ResearchCandidate',
        entityId: candidate.id,
        actor: input.actor,
        metadata: {
          missionId: input.missionId,
          untrustedExternalData: true,
          matchedCompanyId: match?.candidate.id ?? null,
          matchedBy: match?.reason ?? null,
          matchConfidence: match?.confidence ?? null,
          ...(input.metadata ?? {})
        }
      }
    });

    const evidence = await tx.evidence.create({
      data: {
        candidateId: candidate.id,
        eventId: event.id,
        sourceUrl: input.evidence.sourceUrl,
        sourceName: input.evidence.sourceName,
        publishedAt: input.evidence.publishedAt,
        accessedAt: input.evidence.accessedAt,
        observedAt: input.evidence.observedAt,
        claimKey: input.evidence.claimKey,
        freshnessStatus: input.evidence.freshnessStatus,
        legalNotes: input.evidence.legalNotes,
        summary: input.evidence.summary,
        confidence: input.evidence.confidence
      }
    });

    return { ...candidate, evidences: [evidence] };
  });
}

/**
 * Project the next bounded research tasks without changing any candidate.
 * This is deliberately a read-only projection: no crawler, AI, contact write,
 * lead creation, or outreach operation is triggered here.
 */
export async function listResearchMissionActions(input: { missionId: string; limit?: number }) {
  const limit = input.limit ?? MAX_RESEARCH_ACTIONS;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_RESEARCH_ACTIONS) {
    throw new ResearchWorkflowError(400, `limit must be an integer between 1 and ${MAX_RESEARCH_ACTIONS}`);
  }

  const mission = await prisma.researchMission.findUnique({
    where: { id: input.missionId },
    include: {
      candidates: {
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          status: true,
          confidence: true,
          phone: true,
          emailDomain: true,
          website: true,
          createdAt: true,
          evidences: { select: { sourceUrl: true } }
        }
      }
    }
  });
  if (!mission) throw new ResearchWorkflowError(404, 'Research mission not found');
  if (!['ACTIVE', 'PAUSED'].includes(mission.status)) {
    throw new ResearchWorkflowError(409, 'Actions are available only for active or paused research missions');
  }

  const actions: Array<{
    id: string;
    missionId: string;
    candidateId: string;
    type: ResearchMissionActionType;
    priority: number;
    reasonCodes: string[];
    candidateStatus: string;
    confidence: number;
    evidenceSourceCount: number;
    independentEvidenceSourceCount: number;
    hasContactSignal: boolean;
  }> = [];

  for (const candidate of mission.candidates) {
    if (candidate.status === 'ACCEPTED' || candidate.status === 'REJECTED') continue;

    const reasonCodes: Array<{ type: ResearchMissionActionType; reason: string }> = [];
    if (candidate.confidence < MIN_ACCEPTANCE_CONFIDENCE) {
      reasonCodes.push({ type: 'VERIFY_CANDIDATE', reason: 'CANDIDATE_CONFIDENCE_BELOW_ACCEPTANCE_THRESHOLD' });
    }

    const independentEvidenceSourceCount = countIndependentResearchSources(
      candidate.evidences.map((evidence) => evidence.sourceUrl)
    );
    if (
      candidate.status === 'NEEDS_MORE_EVIDENCE' ||
      independentEvidenceSourceCount < MIN_INDEPENDENT_RESEARCH_SOURCES
    ) {
      reasonCodes.push({
        type: 'COLLECT_EVIDENCE',
        reason:
          candidate.status === 'NEEDS_MORE_EVIDENCE'
            ? 'CANDIDATE_REQUESTED_MORE_EVIDENCE'
            : 'INDEPENDENT_EVIDENCE_BELOW_ACCEPTANCE_THRESHOLD'
      });
    }

    // A website is a research source, not an email/phone contact signal.
    const hasContactSignal = Boolean(candidate.phone || candidate.emailDomain);
    if (!hasContactSignal) reasonCodes.push({ type: 'COLLECT_CONTACT_SIGNAL', reason: 'NO_CONTACT_SIGNAL' });

    if (reasonCodes.length === 0 && candidate.status === 'PROPOSED') {
      reasonCodes.push({ type: 'REVIEW_CANDIDATE_DECISION', reason: 'CANDIDATE_READY_FOR_HUMAN_DECISION' });
    }

    for (const item of reasonCodes) {
      actions.push({
        id: `${candidate.id}:${item.type}`,
        missionId: mission.id,
        candidateId: candidate.id,
        type: item.type,
        priority: RESEARCH_ACTION_PRIORITY[item.type],
        reasonCodes: [item.reason],
        candidateStatus: candidate.status,
        confidence: candidate.confidence,
        evidenceSourceCount: candidate.evidences.length,
        independentEvidenceSourceCount,
        hasContactSignal
      });
    }
  }

  actions.sort(
    (left, right) =>
      left.priority - right.priority ||
      left.candidateId.localeCompare(right.candidateId) ||
      left.type.localeCompare(right.type)
  );
  return {
    mission: {
      id: mission.id,
      name: mission.name,
      status: mission.status,
      owner: mission.owner
    },
    actions: actions.slice(0, limit),
    actualWritesPerformed: false,
    externalCallsPerformed: false
  };
}

export async function addResearchEvidence(input: AddResearchEvidenceInput) {
  const candidate = await prisma.researchCandidate.findUnique({
    where: { id: input.candidateId },
    include: { evidences: { select: { sourceUrl: true } } }
  });
  if (!candidate) throw new ResearchWorkflowError(404, 'Research candidate not found');
  if (!['PROPOSED', 'NEEDS_MORE_EVIDENCE'].includes(candidate.status)) {
    throw new ResearchWorkflowError(409, 'Evidence can only be added before a final candidate decision');
  }

  const sourceOrigin = researchSourceOrigin(input.evidence.sourceUrl);
  if (!sourceOrigin) throw new ResearchWorkflowError(400, 'Evidence source must have a valid HTTP(S) origin');

  const evidence = await prisma.$transaction(async (tx) => {
    const event = await tx.event.create({
      data: {
        type: 'RESEARCH_EVIDENCE_ADDED',
        entityType: 'ResearchCandidate',
        entityId: candidate.id,
        actor: input.actor,
        metadata: {
          candidateId: candidate.id,
          sourceOrigin,
          untrustedExternalData: true,
          independentSourceCount: countIndependentResearchSources([
            ...candidate.evidences.map((item) => item.sourceUrl),
            input.evidence.sourceUrl
          ])
        }
      }
    });

    return tx.evidence.create({
      data: {
        candidateId: candidate.id,
        eventId: event.id,
        sourceUrl: input.evidence.sourceUrl,
        sourceName: input.evidence.sourceName,
        publishedAt: input.evidence.publishedAt,
        accessedAt: input.evidence.accessedAt,
        observedAt: input.evidence.observedAt,
        claimKey: input.evidence.claimKey,
        freshnessStatus: input.evidence.freshnessStatus,
        legalNotes: input.evidence.legalNotes,
        summary: input.evidence.summary,
        confidence: input.evidence.confidence
      }
    });
  });

  return evidence;
}

export async function discoverResearchCandidate(input: DiscoverResearchCandidateInput) {
  let signals;
  try {
    signals = extractResearchSignals(input.sourceUrl, input.content);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Research source could not be parsed';
    throw new ResearchWorkflowError(400, message);
  }

  return addResearchCandidate({
    missionId: input.missionId,
    actor: input.actor,
    company: {
      name: signals.name,
      domain: signals.domain ?? undefined,
      website: signals.website,
      sector: signals.sector ?? undefined,
      activity: signals.activity ?? undefined,
      country: signals.country ?? undefined,
      city: signals.city ?? undefined,
      phone: signals.phone ?? undefined,
      emailDomain: signals.emailDomain ?? undefined
    },
    reason: 'Deterministic extraction from a bounded untrusted public source; human verification is required.',
    confidence: signals.confidence,
    evidence: {
      sourceUrl: input.sourceUrl,
      sourceName: input.sourceName,
      accessedAt: input.accessedAt,
      claimKey: 'company.research_signals',
      freshnessStatus: 'CURRENT',
      summary: signals.summary,
      confidence: signals.confidence
    },
    metadata: {
      extractionMethod: 'deterministic',
      aiUsed: false,
      sourceContentBounded: true
    }
  });
}

export async function decideResearchCandidate(input: DecideResearchCandidateInput) {
  const candidate = await prisma.researchCandidate.findUnique({
    where: { id: input.candidateId },
    include: { evidences: { orderBy: { createdAt: 'asc' } }, company: true, matchedCompany: true }
  });
  if (!candidate) throw new ResearchWorkflowError(404, 'Research candidate not found');
  if (candidate.status !== 'PROPOSED') {
    throw new ResearchWorkflowError(409, 'Research candidate has already been decided');
  }

  if (input.decision === 'ACCEPT' && candidate.confidence < MIN_ACCEPTANCE_CONFIDENCE) {
    throw new ResearchWorkflowError(
      409,
      `Candidate confidence must be at least ${MIN_ACCEPTANCE_CONFIDENCE} before acceptance`
    );
  }
  if (
    input.decision === 'ACCEPT' &&
    countIndependentResearchSources(candidate.evidences.map((evidence) => evidence.sourceUrl)) <
      MIN_INDEPENDENT_RESEARCH_SOURCES
  ) {
    throw new ResearchWorkflowError(
      409,
      `At least ${MIN_INDEPENDENT_RESEARCH_SOURCES} independent evidence sources are required before acceptance`
    );
  }
  if (input.decision === 'ACCEPT' && !input.resolution) {
    throw new ResearchWorkflowError(409, 'Explicit LINK_MATCH or CREATE_NEW resolution is required');
  }
  if (input.decision === 'ACCEPT' && !candidate.matchedCompanyId && input.resolution === 'LINK_MATCH') {
    throw new ResearchWorkflowError(409, 'No deterministic company match exists to link');
  }
  if (input.decision !== 'ACCEPT' && input.resolution) {
    throw new ResearchWorkflowError(400, 'Resolution is only valid for an ACCEPT decision');
  }

  const status =
    input.decision === 'ACCEPT'
      ? 'ACCEPTED'
      : input.decision === 'REJECT'
        ? 'REJECTED'
        : 'NEEDS_MORE_EVIDENCE';
  const eventType =
    input.decision === 'ACCEPT'
      ? 'RESEARCH_CANDIDATE_ACCEPTED'
      : input.decision === 'REJECT'
        ? 'RESEARCH_CANDIDATE_REJECTED'
        : 'RESEARCH_CANDIDATE_NEEDS_EVIDENCE';

  try {
    await prisma.$transaction(async (tx) => {
      let companyId = candidate.companyId;
      if (input.decision === 'ACCEPT' && input.resolution === 'LINK_MATCH') {
        companyId = candidate.matchedCompanyId;
      }
      if (input.decision === 'ACCEPT' && input.resolution !== 'LINK_MATCH') {
        const company = await tx.company.create({
          data: {
            name: candidate.proposedName,
            normalizedName: normalizeCompanyName(candidate.proposedName),
            taxNumber: candidate.taxNumber,
            domain: candidate.domain,
            phone: candidate.phone,
            emailDomain: candidate.emailDomain,
            country: candidate.country,
            city: candidate.city,
            address: candidate.address,
            sector: candidate.sector,
            activity: candidate.activity,
            website: candidate.website,
            confidence: candidate.confidence,
            sourceChannel: 'COLD_RESEARCH',
            sourceDetail: candidate.evidences[0]?.sourceUrl
          }
        });
        companyId = company.id;
      }

      const decisionWrite = await tx.researchCandidate.updateMany({
        where: { id: candidate.id, status: 'PROPOSED' },
        data: {
          status,
          companyId,
          decisionReason: input.reason,
          decidedBy: input.decidedBy,
          decidedAt: new Date()
        }
      });

      if (decisionWrite.count !== 1) {
        throw new ResearchWorkflowError(409, 'Research candidate has already been decided');
      }

      if (input.decision === 'ACCEPT' && companyId) {
        await tx.evidence.updateMany({ where: { candidateId: candidate.id }, data: { companyId } });
      }

      await tx.event.create({
        data: {
          type: eventType,
          entityType: 'ResearchCandidate',
          entityId: candidate.id,
          actor: input.decidedBy,
          metadata: {
            reason: input.reason,
            companyId: companyId ?? null,
            resolution: input.resolution ?? null,
            createdLead: false,
            createdOutreach: false
          }
        }
      });

    });

    // Relation includes inside an interactive transaction are interpreted as
    // parallel reads on the same pg client by Prisma 7. Read the response only
    // after the atomic writes commit to avoid pg's deprecated concurrent-query
    // path while still returning the complete candidate representation.
    return await prisma.researchCandidate.findUniqueOrThrow({
      where: { id: candidate.id },
      include: { evidences: { orderBy: { createdAt: 'asc' } }, company: true, matchedCompany: true }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ResearchWorkflowError(409, 'A canonical company with the same unique identity already exists');
    }
    throw error;
  }
}
