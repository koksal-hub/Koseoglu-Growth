import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma';

const RUN_ID = `pr-b-${Date.now()}`;
const NORMALIZED = `pr-b-provenance-${RUN_ID}`;

async function createCompany() {
  return prisma.company.create({
    data: { name: `PR-B Provenance ${RUN_ID}`, normalizedName: NORMALIZED },
    select: { id: true }
  });
}

async function createEvidence(companyId: string, data: Record<string, unknown> = {}) {
  return prisma.evidence.create({
    data: {
      companyId,
      sourceUrl: `https://example.invalid/${RUN_ID}`,
      summary: 'provenance readiness fixture',
      ...data
    }
  });
}

afterAll(async () => {
  await prisma.evidence.deleteMany({ where: { company: { normalizedName: NORMALIZED } } });
  await prisma.company.deleteMany({ where: { normalizedName: NORMALIZED } });
});

describe('evidence provenance readiness', () => {
  it('defaults to an honest UNKNOWN origin with no fabricated availability', async () => {
    const company = await createCompany();
    const evidence = await createEvidence(company.id);

    expect(evidence.dataOrigin).toBe('UNKNOWN');
    expect(evidence.availableAt).toBeNull();
    expect(evidence.evidenceGroupKey).toBeNull();
  });

  it('stores an explicit origin, availability timestamp and evidence group', async () => {
    const company = await createCompany();
    const availableAt = new Date('2026-09-19T08:00:00.000Z');

    const evidence = await createEvidence(company.id, {
      dataOrigin: 'EXTERNAL_EVIDENCE',
      availableAt,
      evidenceGroupKey: `group-${RUN_ID}`
    });

    expect(evidence.dataOrigin).toBe('EXTERNAL_EVIDENCE');
    expect(evidence.availableAt?.toISOString()).toBe(availableAt.toISOString());
    expect(evidence.evidenceGroupKey).toBe(`group-${RUN_ID}`);
  });

  it('allows several evidence rows in one group without implying independence', async () => {
    const company = await createCompany();
    const group = `shared-${RUN_ID}`;

    await createEvidence(company.id, { evidenceGroupKey: group, dataOrigin: 'AI_INFERENCE' });
    await createEvidence(company.id, { evidenceGroupKey: group, dataOrigin: 'HUMAN_OBSERVATION' });

    expect(await prisma.evidence.count({ where: { evidenceGroupKey: group } })).toBe(2);
  });

  it('keeps existing evidence relationships intact', async () => {
    const company = await createCompany();
    const evidence = await createEvidence(company.id);

    const linked = await prisma.evidence.findUnique({
      where: { id: evidence.id },
      select: { companyId: true }
    });

    expect(linked?.companyId).toBe(company.id);
  });
});