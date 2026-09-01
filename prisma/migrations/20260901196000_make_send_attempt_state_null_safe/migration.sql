-- PostgreSQL CHECK expressions accept UNKNOWN, so nullable delivery evidence
-- must use IS NULL / IS TRUE / IS FALSE rather than boolean equality.

ALTER TABLE "SendAttempt"
  ADD CONSTRAINT "SendAttempt_state_shape_null_safe" CHECK (
    ("status" = 'PREPARED'
      AND "attemptCount" = 0
      AND "providerCallPerformed" IS FALSE
      AND "testMessageSubmitted" IS FALSE
      AND "providerMessageId" IS NULL
      AND "dispatchStartedAt" IS NULL
      AND "providerAcceptedAt" IS NULL
      AND "failedAt" IS NULL
      AND "failureCode" IS NULL)
    OR ("status" = 'DISPATCHING'
      AND "attemptCount" > 0
      AND "providerCallPerformed" IS FALSE
      AND "testMessageSubmitted" IS FALSE
      AND "providerMessageId" IS NULL
      AND "dispatchStartedAt" IS NOT NULL
      AND "providerAcceptedAt" IS NULL
      AND "failedAt" IS NULL
      AND "failureCode" IS NULL)
    OR ("status" = 'ACCEPTED'
      AND "attemptCount" > 0
      AND "providerCallPerformed" IS TRUE
      AND "testMessageSubmitted" IS TRUE
      AND "providerMessageId" IS NOT NULL
      AND "dispatchStartedAt" IS NOT NULL
      AND "providerAcceptedAt" IS NOT NULL
      AND "failedAt" IS NULL
      AND "failureCode" IS NULL)
    OR ("status" = 'UNKNOWN'
      AND "attemptCount" > 0
      AND "providerCallPerformed" IS TRUE
      AND "testMessageSubmitted" IS NULL
      AND "providerMessageId" IS NULL
      AND "dispatchStartedAt" IS NOT NULL
      AND "providerAcceptedAt" IS NULL
      AND "failedAt" IS NULL
      AND "failureCode" IS NOT NULL)
    OR ("status" = 'FAILED'
      AND "attemptCount" > 0
      AND "providerCallPerformed" IS TRUE
      AND "dispatchStartedAt" IS NOT NULL
      AND "failedAt" IS NOT NULL
      AND "failureCode" IS NOT NULL
      AND (
        ("testMessageSubmitted" IS FALSE AND "providerMessageId" IS NULL AND "providerAcceptedAt" IS NULL)
        OR ("testMessageSubmitted" IS TRUE AND "providerMessageId" IS NOT NULL AND "providerAcceptedAt" IS NOT NULL)
      ))
    OR ("status" IN ('DELIVERED', 'BOUNCED', 'COMPLAINED', 'SUPPRESSED')
      AND "attemptCount" > 0
      AND "providerCallPerformed" IS TRUE
      AND "testMessageSubmitted" IS TRUE
      AND "providerMessageId" IS NOT NULL
      AND "dispatchStartedAt" IS NOT NULL
      AND "providerAcceptedAt" IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION "enforce_send_attempt_insert"()
RETURNS trigger AS $$
BEGIN
  IF NOT (
    NEW."status" = 'PREPARED'
    AND NEW."providerMessageId" IS NULL
    AND NEW."providerPayloadHash" IS NULL
    AND NEW."attemptCount" = 0
    AND NEW."providerCallPerformed" IS FALSE
    AND NEW."testMessageSubmitted" IS FALSE
    AND NEW."customerMessageSubmitted" IS FALSE
    AND NEW."dispatchStartedAt" IS NULL
    AND NEW."providerAcceptedAt" IS NULL
    AND NEW."failedAt" IS NULL
    AND NEW."failureCode" IS NULL
  ) THEN
    RAISE EXCEPTION 'SendAttempt must be inserted in the canonical PREPARED state';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
