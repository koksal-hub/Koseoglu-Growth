import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/index';
import { prisma } from '../src/lib/prisma';

const RUN_ID = `research-actions-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const missionIds: string[] = [];
const candidateIds: string[] = [];
let server: FastifyInstance;

function payload<T>(response: { payload: string }): T {
  return JSON.parse(response.payload) as T;
}

async function createMission() {
  const response = await server.inject({
    method: 'POST',
    url: '/api/research-missions',
    payload: {
      name: `Deterministic action queue ${RUN_ID}`,
      scope: 'TR-DE logistics prospects',
      country: 'DE',
      sector: 'Manufacturing',
      owner: `${RUN_ID}-owner`
    }
  });
  expect(response.statusCode).toBe(201);
  const mission = payload<{ id: string }>(response);
  missionIds.push(mission.id);
  return mission.id;
}

async function createCandidate(
  missionId: string,
  input: { confidence: number; website?: string; emailDomain?: string; sourceUrl: string }
) {
  const response = await server.inject({
    method: 'POST',
    url: `/api/research-missions/${missionId}/candidates`,
    payload: {
      company: {
        name: `${RUN_ID}-${candidateIds.length + 1}`,
        ...(input.website ? { website: input.website } : {}),
        ...(input.emailDomain ? { emailDomain: input.emailDomain } : {})
      },
      reason: 'Bounded fixture for deterministic action projection.',
      confidence: input.confidence,
      evidence: {
        sourceUrl: input.sourceUrl,
        sourceName: 'Fixture source',
        accessedAt: new Date().toISOString(),
        freshnessStatus: 'CURRENT',
        summary: 'Fixture evidence for a research task projection.',
        confidence: 0.85
      },
      actor: `${RUN_ID}-worker`
    }
  });
  expect(response.statusCode).toBe(201);
  const candidate = payload<{ id: string }>(response);
  candidateIds.push(candidate.id);
  return candidate.id;
}

beforeAll(async () => {
  server = buildServer().server;
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.evidence.deleteMany({ where: { candidateId: { in: candidateIds } } });
  await prisma.event.deleteMany({ where: { entityId: { in: [...candidateIds, ...missionIds] } } });
  await prisma.researchCandidate.deleteMany({ where: { id: { in: candidateIds } } });
  await prisma.researchMission.deleteMany({ where: { id: { in: missionIds } } });
  await server.close();
  await prisma.$disconnect();
});

describe('deterministic research mission action queue', () => {
  it('projects bounded, prioritized actions without writes or external calls', async () => {
    const missionId = await createMission();
    const lowConfidence = await createCandidate(missionId, {
      confidence: 0.4,
      sourceUrl: `https://${RUN_ID}-low.example/about`
    });
    const missingEvidence = await createCandidate(missionId, {
      confidence: 0.9,
      website: `https://${RUN_ID}-evidence.example`,
      emailDomain: `${RUN_ID}-evidence.example`,
      sourceUrl: `https://${RUN_ID}-evidence.example/about`
    });
    const readyForDecision = await createCandidate(missionId, {
      confidence: 0.9,
      website: `https://${RUN_ID}-ready.example`,
      emailDomain: `${RUN_ID}-ready.example`,
      sourceUrl: `https://${RUN_ID}-ready.example/about`
    });
    const secondSource = await server.inject({
      method: 'POST',
      url: `/api/research-candidates/${readyForDecision}/evidence`,
      payload: {
        evidence: {
          sourceUrl: `https://${RUN_ID}-registry.example/company`,
          sourceName: 'Independent registry fixture',
          accessedAt: new Date().toISOString(),
          freshnessStatus: 'CURRENT',
          summary: 'A second independent source confirms the candidate.',
          confidence: 0.85
        },
        actor: `${RUN_ID}-verifier`
      }
    });
    expect(secondSource.statusCode).toBe(201);

    const response = await server.inject({ method: 'GET', url: `/api/research-missions/${missionId}/actions` });
    expect(response.statusCode).toBe(200);
    const result = payload<{
      actions: Array<{
        candidateId: string;
        type: string;
        priority: number;
        independentEvidenceSourceCount: number;
        hasContactSignal: boolean;
      }>;
      actualWritesPerformed: boolean;
      externalCallsPerformed: boolean;
    }>(response);
    expect(result).toMatchObject({ actualWritesPerformed: false, externalCallsPerformed: false });
    expect(result.actions.map((action) => action.priority)).toEqual(
      [...result.actions].sort((left, right) => left.priority - right.priority).map((action) => action.priority)
    );
    expect(result.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ candidateId: lowConfidence, type: 'VERIFY_CANDIDATE', hasContactSignal: false }),
        expect.objectContaining({ candidateId: lowConfidence, type: 'COLLECT_EVIDENCE', independentEvidenceSourceCount: 1 }),
        expect.objectContaining({ candidateId: missingEvidence, type: 'COLLECT_EVIDENCE' }),
        expect.objectContaining({ candidateId: readyForDecision, type: 'REVIEW_CANDIDATE_DECISION', independentEvidenceSourceCount: 2 })
      ])
    );
    expect(result.actions.filter((action) => action.candidateId === readyForDecision)).toHaveLength(1);
  });

  it('validates the bounded action limit', async () => {
    const response = await server.inject({ method: 'GET', url: `/api/research-missions/${missionIds[0]}/actions?limit=101` });
    expect(response.statusCode).toBe(400);
  });
});
