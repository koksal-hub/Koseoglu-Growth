-- Every SendAttempt must enter through the canonical PREPARED receipt shape.
-- Later states are reachable only through the guarded UPDATE transition graph.

CREATE OR REPLACE FUNCTION "enforce_send_attempt_insert"()
RETURNS trigger AS $$
BEGIN
  IF NOT (
    NEW."status" = 'PREPARED'
    AND NEW."providerMessageId" IS NULL
    AND NEW."providerPayloadHash" IS NULL
    AND NEW."attemptCount" = 0
    AND NEW."providerCallPerformed" = false
    AND NEW."testMessageSubmitted" = false
    AND NEW."customerMessageSubmitted" = false
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

CREATE TRIGGER "SendAttempt_insert_guard"
BEFORE INSERT ON "SendAttempt"
FOR EACH ROW EXECUTE FUNCTION "enforce_send_attempt_insert"();
