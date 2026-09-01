-- Additive Phase 6 queue storage. Existing Growth records are preserved.
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'RETRYABLE_FAILED', 'SUCCEEDED', 'DEAD_LETTER');

CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "lastError" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Job_idempotencyKey_key" ON "Job"("idempotencyKey");
CREATE INDEX "Job_status_runAt_idx" ON "Job"("status", "runAt");
CREATE INDEX "Job_lockedAt_idx" ON "Job"("lockedAt");

ALTER TABLE "Job" ADD CONSTRAINT "Job_attempts_range"
  CHECK ("attempts" >= 0 AND "maxAttempts" >= 1 AND "maxAttempts" <= 100);
