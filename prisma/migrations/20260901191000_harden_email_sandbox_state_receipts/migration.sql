-- Harden mutable delivery state without rewriting or removing existing rows.

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'SendAttempt_failure_receipt_shape'
      AND conrelid = '"SendAttempt"'::regclass
  ) THEN
    ALTER TABLE "SendAttempt"
      ADD CONSTRAINT "SendAttempt_failure_receipt_shape" CHECK (
        "status" IN ('UNKNOWN', 'FAILED')
        OR ("failedAt" IS NULL AND "failureCode" IS NULL)
      );
  END IF;
END
$migration$;

CREATE OR REPLACE FUNCTION "enforce_send_attempt_update"()
RETURNS trigger AS $$
BEGIN
  IF ROW(
    OLD."draftId", OLD."approvalId", OLD."revisionId", OLD."contactPointId", OLD."permissionId",
    OLD."provider", OLD."recipientMode", OLD."scenario", OLD."idempotencyKey", OLD."payloadHash",
    OLD."contentHash", OLD."approvedRecipientHash", OLD."recipientHash", OLD."gateReceipt",
    OLD."customerMessageSubmitted", OLD."requestedBy", OLD."preparedAt", OLD."expiresAt", OLD."createdAt"
  ) IS DISTINCT FROM ROW(
    NEW."draftId", NEW."approvalId", NEW."revisionId", NEW."contactPointId", NEW."permissionId",
    NEW."provider", NEW."recipientMode", NEW."scenario", NEW."idempotencyKey", NEW."payloadHash",
    NEW."contentHash", NEW."approvedRecipientHash", NEW."recipientHash", NEW."gateReceipt",
    NEW."customerMessageSubmitted", NEW."requestedBy", NEW."preparedAt", NEW."expiresAt", NEW."createdAt"
  ) THEN
    RAISE EXCEPTION 'SendAttempt immutable receipt fields cannot be updated';
  END IF;

  IF OLD."status" = NEW."status" AND ROW(
    OLD."providerMessageId", OLD."attemptCount", OLD."providerCallPerformed",
    OLD."testMessageSubmitted", OLD."dispatchStartedAt", OLD."providerAcceptedAt",
    OLD."failedAt", OLD."failureCode"
  ) IS DISTINCT FROM ROW(
    NEW."providerMessageId", NEW."attemptCount", NEW."providerCallPerformed",
    NEW."testMessageSubmitted", NEW."dispatchStartedAt", NEW."providerAcceptedAt",
    NEW."failedAt", NEW."failureCode"
  ) THEN
    RAISE EXCEPTION 'SendAttempt state receipt cannot be rewritten without a status transition';
  END IF;

  IF NEW."attemptCount" <> (CASE
    WHEN OLD."status" IN ('PREPARED', 'UNKNOWN') AND NEW."status" = 'DISPATCHING'
      THEN OLD."attemptCount" + 1
    ELSE OLD."attemptCount"
  END) THEN
    RAISE EXCEPTION 'SendAttempt attemptCount must increment exactly once per dispatch';
  END IF;

  IF OLD."providerMessageId" IS NOT NULL
    AND NEW."providerMessageId" IS DISTINCT FROM OLD."providerMessageId" THEN
    RAISE EXCEPTION 'SendAttempt providerMessageId cannot be rewritten';
  END IF;
  IF OLD."providerAcceptedAt" IS NOT NULL
    AND NEW."providerAcceptedAt" IS DISTINCT FROM OLD."providerAcceptedAt" THEN
    RAISE EXCEPTION 'SendAttempt providerAcceptedAt cannot be rewritten';
  END IF;
  IF OLD."dispatchStartedAt" IS NOT NULL
    AND NEW."dispatchStartedAt" IS DISTINCT FROM OLD."dispatchStartedAt"
    AND NOT (OLD."status" = 'UNKNOWN' AND NEW."status" = 'DISPATCHING') THEN
    RAISE EXCEPTION 'SendAttempt dispatchStartedAt can change only for an UNKNOWN retry';
  END IF;

  IF NOT (
    (OLD."status" = 'PREPARED' AND NEW."status" = 'DISPATCHING')
    OR (OLD."status" = 'DISPATCHING' AND NEW."status" IN ('ACCEPTED', 'UNKNOWN', 'FAILED'))
    OR (OLD."status" = 'UNKNOWN' AND NEW."status" = 'DISPATCHING')
    OR (OLD."status" = 'ACCEPTED' AND NEW."status" IN ('DELIVERED', 'BOUNCED', 'COMPLAINED', 'SUPPRESSED', 'FAILED'))
    OR (OLD."status" = 'DELIVERED' AND NEW."status" = 'COMPLAINED')
    OR (OLD."status" = NEW."status")
  ) THEN
    RAISE EXCEPTION 'Illegal SendAttempt status transition: % -> %', OLD."status", NEW."status";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
