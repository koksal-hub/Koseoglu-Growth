-- Add provenance-chain and append-only protections identified by independent review.

CREATE UNIQUE INDEX "OutreachDraft_id_contactPointId_key"
  ON "OutreachDraft"("id", "contactPointId");
CREATE UNIQUE INDEX "OutreachApproval_send_permission_receipt_key"
  ON "OutreachApproval"("id", "draftId", "revisionId", "contentHash", "permissionId");

ALTER TABLE "SendAttempt" ADD CONSTRAINT "SendAttempt_draftId_fkey"
  FOREIGN KEY ("draftId") REFERENCES "OutreachDraft"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SendAttempt" ADD CONSTRAINT "SendAttempt_approvalId_fkey"
  FOREIGN KEY ("approvalId") REFERENCES "OutreachApproval"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SendAttempt" ADD CONSTRAINT "SendAttempt_revisionId_fkey"
  FOREIGN KEY ("revisionId") REFERENCES "OutreachDraftRevision"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SendAttempt" ADD CONSTRAINT "SendAttempt_permissionId_fkey"
  FOREIGN KEY ("permissionId") REFERENCES "CommunicationPermission"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SendAttempt" ADD CONSTRAINT "SendAttempt_draft_contact_fkey"
  FOREIGN KEY ("draftId", "contactPointId")
  REFERENCES "OutreachDraft"("id", "contactPointId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SendAttempt" ADD CONSTRAINT "SendAttempt_approval_permission_fkey"
  FOREIGN KEY ("approvalId", "draftId", "revisionId", "contentHash", "permissionId")
  REFERENCES "OutreachApproval"("id", "draftId", "revisionId", "contentHash", "permissionId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryEvent" ADD CONSTRAINT "DeliveryEvent_sendAttemptId_fkey"
  FOREIGN KEY ("sendAttemptId") REFERENCES "SendAttempt"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TRIGGER "ProviderWebhookReceipt_delete_guard"
BEFORE DELETE ON "ProviderWebhookReceipt"
FOR EACH ROW EXECUTE FUNCTION "reject_email_receipt_update"();
CREATE TRIGGER "DeliveryEvent_delete_guard"
BEFORE DELETE ON "DeliveryEvent"
FOR EACH ROW EXECUTE FUNCTION "reject_email_receipt_update"();
CREATE TRIGGER "Reply_delete_guard"
BEFORE DELETE ON "Reply"
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
