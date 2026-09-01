import crypto from 'node:crypto';
import { Prisma, type Job } from '@prisma/client';
import { prisma } from './prisma';

export const DEFAULT_MAX_ATTEMPTS = 3;
export const MAX_MAX_ATTEMPTS = 100;
export const JOB_LEASE_MS = 5 * 60 * 1000;
export const BASE_BACKOFF_MS = 1_000;
export const MAX_BACKOFF_MS = 60 * 60 * 1_000;
export const MAX_JOB_ERROR_LENGTH = 2_000;

const MAX_IDEMPOTENCY_KEY_LENGTH = 128;
const SAFE_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;

export class JobQueueError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message);
    this.name = 'JobQueueError';
  }
}

export type EnqueueJobInput = {
  type: string;
  payload: unknown;
  idempotencyKey: string;
  maxAttempts?: number;
  runAt?: Date;
};

export type JobHandler = (job: Job) => Promise<void>;

const handlers = new Map<string, JobHandler>();

function validateKey(value: string, label: string) {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > MAX_IDEMPOTENCY_KEY_LENGTH ||
    !SAFE_KEY_PATTERN.test(value)
  ) {
    throw new JobQueueError(400, `Invalid ${label}`);
  }
}

function validateDate(value: Date | undefined) {
  if (value && Number.isNaN(value.getTime())) {
    throw new JobQueueError(400, 'Invalid runAt');
  }
}

/** Convert unknown input to a canonical JSON value with recursively sorted keys. */
function canonicalize(value: unknown, path = 'payload'): Prisma.JsonValue {
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new JobQueueError(400, `${path} must be finite JSON`);
    return value;
  }
  if (Array.isArray(value)) return value.map((item, index) => canonicalize(item, `${path}[${index}]`));
  if (typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new JobQueueError(400, `${path} must contain JSON values only`);
  }

  const sorted: Record<string, Prisma.JsonValue> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    sorted[key] = canonicalize((value as Record<string, unknown>)[key], `${path}.${key}`);
  }
  return sorted;
}

function hashPayload(payload: Prisma.JsonValue) {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function safeErrorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/(?:sk|re)_[A-Za-z0-9_-]{12,}/g, '[REDACTED]')
    .slice(0, MAX_JOB_ERROR_LENGTH);
}

export function computeBackoffMs(attempts: number) {
  if (!Number.isInteger(attempts) || attempts < 1) return BASE_BACKOFF_MS;
  return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** Math.min(attempts - 1, 20));
}

/** Enqueue once; a repeated key is accepted only when its immutable payload matches. */
export async function enqueueJob(input: EnqueueJobInput) {
  validateKey(input.type, 'job type');
  validateKey(input.idempotencyKey, 'idempotency key');
  validateDate(input.runAt);
  const maxAttempts = input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > MAX_MAX_ATTEMPTS) {
    throw new JobQueueError(400, `maxAttempts must be an integer between 1 and ${MAX_MAX_ATTEMPTS}`);
  }
  const payload = canonicalize(input.payload);
  const payloadHash = hashPayload(payload);

  try {
    return await prisma.job.create({
      data: {
        type: input.type,
        // Prisma's input type excludes JavaScript null even though PostgreSQL
        // JSONB accepts it; the runtime value remains a validated JSON value.
        payload: payload as Prisma.InputJsonValue,
        payloadHash,
        idempotencyKey: input.idempotencyKey,
        maxAttempts,
        runAt: input.runAt ?? new Date(),
      },
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
      throw error;
    }
    const existing = await prisma.job.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (!existing) throw error;
    if (existing.type !== input.type || existing.payloadHash !== payloadHash) {
      throw new JobQueueError(409, 'Idempotency key already identifies a different job payload');
    }
    return existing;
  }
}

/** Atomically claim the oldest due job while allowing concurrent workers. */
export async function claimNextJob(workerId: string, now = new Date()) {
  validateKey(workerId, 'worker id');
  validateDate(now);
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`
        SELECT "id"
        FROM "Job"
        WHERE "status" IN ('QUEUED', 'RETRYABLE_FAILED')
          AND "runAt" <= ${now}
        ORDER BY "runAt" ASC, "createdAt" ASC, "id" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      `
    );
    if (rows.length === 0) return null;
    return tx.job.update({
      where: { id: rows[0].id },
      data: {
        status: 'RUNNING',
        attempts: { increment: 1 },
        lockedAt: now,
        lockedBy: workerId,
        completedAt: null,
      },
    });
  });
}

export async function completeJob(jobId: string, workerId: string, completedAt = new Date()) {
  validateKey(workerId, 'worker id');
  validateDate(completedAt);
  const result = await prisma.job.updateMany({
    where: { id: jobId, status: 'RUNNING', lockedBy: workerId },
    data: {
      status: 'SUCCEEDED',
      completedAt,
      lockedAt: null,
      lockedBy: null,
    },
  });
  if (result.count !== 1) throw new JobQueueError(409, 'Job is not running for this worker');
  return prisma.job.findUniqueOrThrow({ where: { id: jobId } });
}

export async function failJob(jobId: string, workerId: string, error: unknown, failedAt = new Date()) {
  validateKey(workerId, 'worker id');
  validateDate(failedAt);
  const current = await prisma.job.findFirst({
    where: { id: jobId, status: 'RUNNING', lockedBy: workerId },
  });
  if (!current) throw new JobQueueError(409, 'Job is not running for this worker');

  const terminal = current.attempts >= current.maxAttempts;
  const nextStatus = terminal ? 'DEAD_LETTER' : 'RETRYABLE_FAILED';
  const nextRunAt = terminal ? current.runAt : new Date(failedAt.getTime() + computeBackoffMs(current.attempts));
  await prisma.job.updateMany({
    where: { id: jobId, status: 'RUNNING', lockedBy: workerId },
    data: {
      status: nextStatus,
      runAt: nextRunAt,
      lastError: safeErrorMessage(error),
      lockedAt: null,
      lockedBy: null,
    },
  });
  return prisma.job.findUniqueOrThrow({ where: { id: jobId } });
}

/** Return leased jobs to the retry path; exhausted jobs become dead letters. */
export async function recoverStaleJobs(now = new Date(), leaseMs = JOB_LEASE_MS) {
  validateDate(now);
  if (!Number.isFinite(leaseMs) || leaseMs < 1) throw new JobQueueError(400, 'Invalid leaseMs');
  const cutoff = new Date(now.getTime() - leaseMs);
  return prisma.$transaction(async (tx) => {
    const stale = await tx.job.findMany({
      where: { status: 'RUNNING', lockedAt: { lt: cutoff } },
      select: { id: true, lockedAt: true, attempts: true, maxAttempts: true },
    });
    let recovered = 0;
    for (const job of stale) {
      const terminal = job.attempts >= job.maxAttempts;
      const result = await tx.job.updateMany({
        where: { id: job.id, status: 'RUNNING', lockedAt: job.lockedAt },
        data: {
          status: terminal ? 'DEAD_LETTER' : 'RETRYABLE_FAILED',
          runAt: now,
          lastError: terminal ? 'stale lease exceeded max attempts' : 'stale lease recovered',
          lockedAt: null,
          lockedBy: null,
        },
      });
      recovered += result.count;
    }
    return recovered;
  });
}

export function registerJobHandler(type: string, handler: JobHandler) {
  validateKey(type, 'job type');
  if (handlers.has(type)) throw new JobQueueError(409, `Job handler already registered for ${type}`);
  handlers.set(type, handler);
  return () => {
    if (handlers.get(type) === handler) handlers.delete(type);
  };
}

export async function runWorkerTick(
  workerId: string,
  options: { now?: Date; leaseMs?: number; batchSize?: number } = {}
) {
  const batchSize = options.batchSize ?? 10;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) {
    throw new JobQueueError(400, 'batchSize must be an integer between 1 and 100');
  }
  const now = options.now ?? new Date();
  await recoverStaleJobs(now, options.leaseMs ?? JOB_LEASE_MS);
  let processed = 0;
  for (let index = 0; index < batchSize; index += 1) {
    const job = await claimNextJob(workerId, now);
    if (!job) break;
    const handler = handlers.get(job.type);
    if (!handler) {
      await failJob(job.id, workerId, new Error(`No handler registered for ${job.type}`), now);
    } else {
      try {
        await handler(job);
        await completeJob(job.id, workerId, now);
      } catch (error) {
        await failJob(job.id, workerId, error, now);
      }
    }
    processed += 1;
  }
  return processed;
}

/** Start a bounded in-process scheduler. Stop the returned function on shutdown. */
export function startJobScheduler(
  workerId: string,
  options: { intervalMs?: number; leaseMs?: number; batchSize?: number } = {}
) {
  const intervalMs = options.intervalMs ?? 1_000;
  if (!Number.isInteger(intervalMs) || intervalMs < 10) throw new JobQueueError(400, 'Invalid intervalMs');
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tick = async () => {
    if (stopped) return;
    await runWorkerTick(workerId, options);
    if (!stopped) timer = setTimeout(() => void tick(), intervalMs);
  };
  void tick();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
