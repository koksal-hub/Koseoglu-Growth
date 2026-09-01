-- Bind retries to the exact provider payload, preserve SendAttempt history, and
-- remove only redundant Phase 5 foreign keys that are superseded by stronger
-- composite provenance constraints. No row or business column is removed.

ALTER TABLE "SendAttempt"
  ADD COLUMN "providerPayloadHash" TEXT;

ALTER TABLE "SendAttempt"
  ADD CONSTRAINT "SendAttempt_provider_payload_hash_shape" CHECK (
    "providerPayloadHash" IS NULL
    OR "providerPayloadHash" ~ '^[0-9a-f]{64}$'
  );

ALTER TABLE "SendAttempt" DROP CONSTRAINT "SendAttempt_draftId_fkey";
ALTER TABLE "SendAttempt" DROP CONSTRAINT "SendAttempt_approvalId_fkey";
ALTER TABLE "SendAttempt" DROP CONSTRAINT "SendAttempt_revisionId_fkey";
ALTER TABLE "SendAttempt" DROP CONSTRAINT "SendAttempt_permissionId_fkey";
ALTER TABLE "SendAttempt" DROP CONSTRAINT "SendAttempt_approval_receipt_fkey";
ALTER TABLE "DeliveryEvent" DROP CONSTRAINT "DeliveryEvent_sendAttemptId_fkey";

CREATE TRIGGER "SendAttempt_delete_guard"
BEFORE DELETE ON "SendAttempt"
FOR EACH ROW EXECUTE FUNCTION "reject_email_receipt_update"();

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
    OLD."providerMessageId", OLD."providerPayloadHash", OLD."attemptCount",
    OLD."providerCallPerformed", OLD."testMessageSubmitted", OLD."dispatchStartedAt",
    OLD."providerAcceptedAt", OLD."failedAt", OLD."failureCode"
  ) IS DISTINCT FROM ROW(
    NEW."providerMessageId", NEW."providerPayloadHash", NEW."attemptCount",
    NEW."providerCallPerformed", NEW."testMessageSubmitted", NEW."dispatchStartedAt",
    NEW."providerAcceptedAt", NEW."failedAt", NEW."failureCode"
  ) THEN
    RAISE EXCEPTION 'SendAttempt state receipt cannot be rewritten without a status transition';
  END IF;

  IF OLD."providerPayloadHash" IS NOT NULL
    AND NEW."providerPayloadHash" IS DISTINCT FROM OLD."providerPayloadHash" THEN
    RAISE EXCEPTION 'SendAttempt providerPayloadHash cannot be rewritten';
  END IF;
  IF OLD."providerPayloadHash" IS NULL
    AND NEW."providerPayloadHash" IS NOT NULL
    AND NOT (OLD."status" IN ('PREPARED', 'UNKNOWN') AND NEW."status" = 'DISPATCHING') THEN
    RAISE EXCEPTION 'SendAttempt providerPayloadHash can be set only when dispatch starts';
  END IF;
  IF NEW."status" = 'DISPATCHING' AND NEW."providerPayloadHash" IS NULL THEN
    RAISE EXCEPTION 'SendAttempt DISPATCHING requires an exact provider payload hash';
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
    OR (OLD."status" = 'UNKNOWN' AND NEW."status" IN ('DISPATCHING', 'ACCEPTED'))
    OR (OLD."status" = 'ACCEPTED' AND NEW."status" IN ('DELIVERED', 'BOUNCED', 'COMPLAINED', 'SUPPRESSED', 'FAILED'))
    OR (OLD."status" = 'DELIVERED' AND NEW."status" = 'COMPLAINED')
    OR (OLD."status" = NEW."status")
  ) THEN
    RAISE EXCEPTION 'Illegal SendAttempt status transition: % -> %', OLD."status", NEW."status";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
