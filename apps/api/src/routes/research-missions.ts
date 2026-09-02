import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  addResearchCandidate,
  addResearchEvidence,
  createResearchMission,
  decideResearchCandidate,
  discoverResearchCandidate,
  getResearchMission,
  listResearchMissions,
  listResearchMissionActions,
  ResearchWorkflowError
} from '../lib/research';

const shortText = z.string().trim().min(1).max(200);
const optionalShortText = shortText.optional();
const actorText = z.string().trim().min(1).max(120);
const sensitiveUrlParameter = /^(?:access_token|api_?key|auth|key|password|secret|sig|signature|token)$/i;
const httpUrl = z
  .string()
  .trim()
  .url()
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        ['http:', 'https:'].includes(url.protocol) &&
        !url.username &&
        !url.password &&
        !Array.from(url.searchParams.keys()).some((key) => sensitiveUrlParameter.test(key))
      );
    } catch {
      return false;
    }
  }, 'Only credential-free HTTP(S) URLs without secret query parameters are allowed');

const idParamsSchema = z.object({ id: z.string().trim().min(1).max(64) }).strict();
const actionQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(100) }).strict();

const createMissionSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    scope: z.string().trim().min(1).max(2000),
    country: optionalShortText,
    region: optionalShortText,
    sector: optionalShortText,
    route: optionalShortText,
    budgetLimit: z.string().regex(/^\d{1,12}(?:\.\d{1,2})?$/).optional(),
    budgetCurrency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default('TRY'),
    owner: actorText
  })
  .strict();

const evidenceInputSchema = z
  .object({
    sourceUrl: httpUrl,
    sourceName: optionalShortText,
    publishedAt: z.coerce.date().optional(),
    accessedAt: z.coerce.date(),
    observedAt: z.coerce.date().optional(),
    claimKey: z.string().trim().min(1).max(160).optional(),
    freshnessStatus: z.enum(['CURRENT', 'STALE', 'UNKNOWN']).default('UNKNOWN'),
    legalNotes: z.string().trim().min(1).max(1000).optional(),
    summary: z.string().trim().min(1).max(4000),
    confidence: z.number().min(0).max(1)
  })
  .strict()
  .superRefine((value, context) => {
    const allowedClockSkewMs = 5 * 60 * 1000;
    if (value.accessedAt.getTime() > Date.now() + allowedClockSkewMs) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['accessedAt'], message: 'accessedAt cannot be in the future' });
    }
    for (const [key, date] of [
      ['publishedAt', value.publishedAt],
      ['observedAt', value.observedAt]
    ] as const) {
      if (date && date.getTime() > value.accessedAt.getTime()) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} cannot be later than accessedAt`
        });
      }
    }
  });

const addCandidateSchema = z
  .object({
    company: z
      .object({
        name: z.string().trim().min(1).max(200),
        taxNumber: optionalShortText,
        domain: optionalShortText,
        phone: optionalShortText,
        emailDomain: optionalShortText,
        country: optionalShortText,
        city: optionalShortText,
        address: z.string().trim().min(1).max(1000).optional(),
        sector: optionalShortText,
        activity: z.string().trim().min(1).max(500).optional(),
        website: httpUrl.optional()
      })
      .strict(),
    reason: z.string().trim().min(1).max(2000),
    confidence: z.number().min(0).max(1),
    evidence: evidenceInputSchema,
    actor: actorText
  })
  .strict();

const discoverSchema = z
  .object({
    sourceUrl: httpUrl,
    sourceName: optionalShortText,
    accessedAt: z.coerce.date(),
    content: z.string().trim().min(1).max(100_000),
    actor: actorText
  })
  .strict()
  .superRefine((value, context) => {
    const allowedClockSkewMs = 5 * 60 * 1000;
    if (value.accessedAt.getTime() > Date.now() + allowedClockSkewMs) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['accessedAt'], message: 'accessedAt cannot be in the future' });
    }
  });

const addEvidenceSchema = z
  .object({
    evidence: evidenceInputSchema,
    actor: actorText
  })
  .strict();

const decideCandidateSchema = z
  .object({
    decision: z.enum(['ACCEPT', 'REJECT', 'REQUEST_MORE_EVIDENCE']),
    reason: z.string().trim().min(1).max(2000),
    decidedBy: actorText,
    resolution: z.enum(['LINK_MATCH', 'CREATE_NEW']).optional()
  })
  .strict();

const evidenceResponseSchema = z.object({
  id: z.string(),
  sourceUrl: z.string(),
  sourceName: z.string().nullable(),
  publishedAt: z.string().nullable(),
  accessedAt: z.string(),
  observedAt: z.string().nullable(),
  claimKey: z.string().nullable(),
  freshnessStatus: z.enum(['CURRENT', 'STALE', 'UNKNOWN']),
  legalNotes: z.string().nullable(),
  summary: z.string(),
  confidence: z.number()
});

const candidateResponseSchema = z.object({
  id: z.string(),
  missionId: z.string(),
  companyId: z.string().nullable(),
  matchedCompanyId: z.string().nullable(),
  proposedName: z.string(),
  taxNumber: z.string().nullable(),
  domain: z.string().nullable(),
  phone: z.string().nullable(),
  emailDomain: z.string().nullable(),
  country: z.string().nullable(),
  city: z.string().nullable(),
  address: z.string().nullable(),
  sector: z.string().nullable(),
  activity: z.string().nullable(),
  website: z.string().nullable(),
  reason: z.string(),
  status: z.enum(['PROPOSED', 'NEEDS_MORE_EVIDENCE', 'ACCEPTED', 'REJECTED']),
  confidence: z.number(),
  matchedBy: z.string().nullable(),
  matchConfidence: z.number().nullable(),
  decisionReason: z.string().nullable(),
  decidedBy: z.string().nullable(),
  decidedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  evidences: z.array(evidenceResponseSchema)
});

const missionResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  scope: z.string(),
  country: z.string().nullable(),
  region: z.string().nullable(),
  sector: z.string().nullable(),
  route: z.string().nullable(),
  status: z.enum(['ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED']),
  budgetLimit: z.string().nullable(),
  budgetCurrency: z.string(),
  owner: z.string(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
});

type EvidenceRecord = {
  id: string;
  sourceUrl: string;
  sourceName: string | null;
  publishedAt: Date | null;
  accessedAt: Date;
  observedAt: Date | null;
  claimKey: string | null;
  freshnessStatus: 'CURRENT' | 'STALE' | 'UNKNOWN';
  legalNotes: string | null;
  summary: string;
  confidence: number;
};

type CandidateRecord = {
  id: string;
  missionId: string;
  companyId: string | null;
  matchedCompanyId: string | null;
  proposedName: string;
  taxNumber: string | null;
  domain: string | null;
  phone: string | null;
  emailDomain: string | null;
  country: string | null;
  city: string | null;
  address: string | null;
  sector: string | null;
  activity: string | null;
  website: string | null;
  reason: string;
  status: 'PROPOSED' | 'NEEDS_MORE_EVIDENCE' | 'ACCEPTED' | 'REJECTED';
  confidence: number;
  matchedBy: string | null;
  matchConfidence: number | null;
  decisionReason: string | null;
  decidedBy: string | null;
  decidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  evidences: EvidenceRecord[];
};

function parseRequest<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
    throw new ResearchWorkflowError(400, `Invalid request: ${path}${issue.message}`);
  }
  return result.data;
}

function serializeEvidence(evidence: EvidenceRecord) {
  return evidenceResponseSchema.parse({
    ...evidence,
    publishedAt: evidence.publishedAt?.toISOString() ?? null,
    accessedAt: evidence.accessedAt.toISOString(),
    observedAt: evidence.observedAt?.toISOString() ?? null
  });
}

function serializeCandidate(candidate: CandidateRecord) {
  return candidateResponseSchema.parse({
    ...candidate,
    decidedAt: candidate.decidedAt?.toISOString() ?? null,
    createdAt: candidate.createdAt.toISOString(),
    updatedAt: candidate.updatedAt.toISOString(),
    evidences: candidate.evidences.map(serializeEvidence)
  });
}

function serializeMission(mission: {
  id: string;
  name: string;
  scope: string;
  country: string | null;
  region: string | null;
  sector: string | null;
  route: string | null;
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
  budgetLimit: PrismaDecimal | null;
  budgetCurrency: string;
  owner: string;
  startedAt: Date;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return missionResponseSchema.parse({
    ...mission,
    budgetLimit: mission.budgetLimit?.toString() ?? null,
    startedAt: mission.startedAt.toISOString(),
    completedAt: mission.completedAt?.toISOString() ?? null,
    createdAt: mission.createdAt.toISOString(),
    updatedAt: mission.updatedAt.toISOString()
  });
}

type PrismaDecimal = { toString(): string };

const researchMissionRoutes: FastifyPluginAsync = async (server) => {
  server.post('/research-missions', async (request, reply) => {
    const input = parseRequest(createMissionSchema, request.body);
    const mission = await createResearchMission(input);
    return reply.status(201).send(serializeMission(mission));
  });

  server.get('/research-missions', async (_request, reply) => {
    const missions = await listResearchMissions();
    const response = z
      .array(missionResponseSchema.extend({ candidateCount: z.number().int().nonnegative() }))
      .parse(
        missions.map((mission) => ({
          ...serializeMission(mission),
          candidateCount: mission._count.candidates
        }))
      );
    return reply.send(response);
  });

  server.get('/research-missions/:id', async (request, reply) => {
    const { id } = parseRequest(idParamsSchema, request.params);
    const mission = await getResearchMission(id);
    const response = missionResponseSchema
      .extend({ candidates: z.array(candidateResponseSchema) })
      .parse({
        ...serializeMission(mission),
        candidates: mission.candidates.map(serializeCandidate)
      });
    return reply.send(response);
  });

  server.get('/research-missions/:id/actions', async (request, reply) => {
    const { id } = parseRequest(idParamsSchema, request.params);
    const { limit } = parseRequest(actionQuerySchema, request.query);
    return reply.send(await listResearchMissionActions({ missionId: id, limit }));
  });

  server.post('/research-missions/:id/discover', async (request, reply) => {
    const { id } = parseRequest(idParamsSchema, request.params);
    const input = parseRequest(discoverSchema, request.body);
    const candidate = await discoverResearchCandidate({ missionId: id, ...input });
    return reply.status(201).send(serializeCandidate(candidate));
  });

  server.post('/research-missions/:id/candidates', async (request, reply) => {
    const { id } = parseRequest(idParamsSchema, request.params);
    const input = parseRequest(addCandidateSchema, request.body);
    const candidate = await addResearchCandidate({ missionId: id, ...input });
    return reply.status(201).send(serializeCandidate(candidate));
  });

  server.post('/research-candidates/:id/evidence', async (request, reply) => {
    const { id } = parseRequest(idParamsSchema, request.params);
    const input = parseRequest(addEvidenceSchema, request.body);
    const evidence = await addResearchEvidence({ candidateId: id, ...input });
    return reply.status(201).send(serializeEvidence(evidence));
  });

  server.post('/research-candidates/:id/decision', async (request, reply) => {
    const { id } = parseRequest(idParamsSchema, request.params);
    const input = parseRequest(decideCandidateSchema, request.body);
    const candidate = await decideResearchCandidate({ candidateId: id, ...input });
    return reply.send(serializeCandidate(candidate));
  });
};

export default researchMissionRoutes;
