import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma';
import {
  claimNextJob,
  completeJob,
  enqueueJob,
  failJob,
  JOB_LEASE_MS,
  recoverStaleJobs,
  registerJobHandler,
  runWorkerTick,
} from '../src/lib/job-queue';

const RUN_ID = `queue-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const jobIds: string[] = [];

describe('durable job queue', () => {
  beforeAll(async () => {
    await prisma.$connect();
    // Remove only fixtures from an interrupted run in this disposable test DB.
    await prisma.job.deleteMany({ where: { type: { startsWith: 'queue-' } } });
  });

  afterAll(async () => {
    await prisma.job.deleteMany({ where: { id: { in: jobIds } } });
    await prisma.$disconnect();
  });

  it('is idempotent for the same canonical payload and rejects a conflicting payload', async () => {
    const idempotencyKey = `${RUN_ID}-idempotent`;
    const first = await enqueueJob({
      type: `${RUN_ID}-research`,
      payload: { country: 'TR', sectors: ['manufacturing'], nested: { b: 2, a: 1 } },
      idempotencyKey,
      runAt: new Date(Date.now() + 86_400_000),
    });
    jobIds.push(first.id);

    const repeat = await enqueueJob({
      type: first.type,
      payload: { nested: { a: 1, b: 2 }, sectors: ['manufacturing'], country: 'TR' },
      idempotencyKey,
    });
    expect(repeat.id).toBe(first.id);
    expect(repeat.payloadHash).toBe(first.payloadHash);

    await expect(
      enqueueJob({
        type: first.type,
        payload: { country: 'DE' },
        idempotencyKey,
      })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('claims due work atomically and completes it for the owning worker', async () => {
    const now = new Date();
    const queued = await enqueueJob({
      type: `${RUN_ID}-claim`,
      payload: { task: 'rank' },
      idempotencyKey: `${RUN_ID}-claim`,
      runAt: new Date(now.getTime() - 1_000),
    });
    jobIds.push(queued.id);

    const claimed = await claimNextJob(`${RUN_ID}-worker`, now);
    expect(claimed?.id).toBe(queued.id);
    expect(claimed?.status).toBe('RUNNING');
    expect(claimed?.attempts).toBe(1);
    expect(claimed?.lockedBy).toBe(`${RUN_ID}-worker`);

    const completed = await completeJob(queued.id, `${RUN_ID}-worker`, now);
    expect(completed.status).toBe('SUCCEEDED');
    expect(completed.lockedBy).toBeNull();
    expect(completed.completedAt).toEqual(now);
  });

  it('does not give the same due row to concurrent workers', async () => {
    const now = new Date();
    const first = await enqueueJob({
      type: `${RUN_ID}-parallel-a`,
      payload: { task: 'parallel-a' },
      idempotencyKey: `${RUN_ID}-parallel-a`,
      runAt: new Date(now.getTime() - 1_000),
    });
    const second = await enqueueJob({
      type: `${RUN_ID}-parallel-b`,
      payload: { task: 'parallel-b' },
      idempotencyKey: `${RUN_ID}-parallel-b`,
      runAt: new Date(now.getTime() - 1_000),
    });
    jobIds.push(first.id, second.id);

    const workers = [`${RUN_ID}-parallel-worker-a`, `${RUN_ID}-parallel-worker-b`];
    const claims = await Promise.all(workers.map(async (workerId) => ({
      workerId,
      job: await claimNextJob(workerId, now),
    })));
    const claimedIds = claims.map(({ job }) => job?.id).filter((id): id is string => Boolean(id));
    expect(new Set(claimedIds)).toEqual(new Set([first.id, second.id]));
    const claimed = claims.filter((claim) => claim.job !== null);
    await Promise.all(claimed.map((claim) => completeJob(claim.job!.id, claim.workerId, now)));
  });

  it('backs off retryable failures and moves exhausted jobs to dead letter', async () => {
    const now = new Date();
    const queued = await enqueueJob({
      type: `${RUN_ID}-retry`,
      payload: { task: 'retry' },
      idempotencyKey: `${RUN_ID}-retry`,
      maxAttempts: 2,
      runAt: new Date(now.getTime() - 1_000),
    });
    jobIds.push(queued.id);
    const workerId = `${RUN_ID}-retry-worker`;

    const firstClaim = await claimNextJob(workerId, now);
    expect(firstClaim?.id).toBe(queued.id);
    const retryable = await failJob(
      queued.id,
      workerId,
      new Error('temporary provider timeout sk_test_1234567890abcdef'),
      now
    );
    expect(retryable.status).toBe('RETRYABLE_FAILED');
    expect(retryable.runAt.getTime()).toBeGreaterThan(now.getTime());
    expect(retryable.lastError).toBe('temporary provider timeout [REDACTED]');

    const secondClaim = await claimNextJob(workerId, new Date(now.getTime() + 10_000));
    expect(secondClaim?.id).toBe(queued.id);
    const deadLetter = await failJob(
      queued.id,
      workerId,
      new Error('permanent failure'),
      new Date(now.getTime() + 10_000)
    );
    expect(deadLetter.status).toBe('DEAD_LETTER');
    expect(deadLetter.lastError).toBe('permanent failure');
  });

  it('recovers a stale lease without resetting the attempt counter', async () => {
    const leasedAt = new Date();
    const queued = await enqueueJob({
      type: `${RUN_ID}-stale`,
      payload: { task: 'recover' },
      idempotencyKey: `${RUN_ID}-stale`,
      runAt: new Date(leasedAt.getTime() - 1_000),
    });
    jobIds.push(queued.id);
    const workerId = `${RUN_ID}-stale-worker`;
    const claimed = await claimNextJob(workerId, leasedAt);
    expect(claimed?.attempts).toBe(1);

    const recovered = await recoverStaleJobs(
      new Date(leasedAt.getTime() + JOB_LEASE_MS + 1),
      JOB_LEASE_MS
    );
    expect(recovered).toBe(1);
    const requeued = await prisma.job.findUniqueOrThrow({ where: { id: queued.id } });
    expect(requeued.status).toBe('RETRYABLE_FAILED');
    expect(requeued.attempts).toBe(1);
    expect(requeued.lockedBy).toBeNull();
  });

  it('runs only a registered in-process handler and records success', async () => {
    const now = new Date();
    const type = `${RUN_ID}-handler`;
    let calls = 0;
    const unregister = registerJobHandler(type, async (job) => {
      expect(job.type).toBe(type);
      calls += 1;
    });
    const queued = await enqueueJob({
      type,
      payload: { task: 'deterministic internal work' },
      idempotencyKey: `${RUN_ID}-handler`,
      runAt: new Date(now.getTime() - 1_000),
    });
    jobIds.push(queued.id);

    await expect(runWorkerTick(`${RUN_ID}-handler-worker`, { now, batchSize: 1 })).resolves.toBe(1);
    const completed = await prisma.job.findUniqueOrThrow({ where: { id: queued.id } });
    expect(calls).toBe(1);
    expect(completed.status).toBe('SUCCEEDED');
    unregister();
  });
});
