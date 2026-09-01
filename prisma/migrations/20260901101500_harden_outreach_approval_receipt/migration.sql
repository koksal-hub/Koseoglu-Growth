ALTER TABLE "OutreachDraft"
  ADD CONSTRAINT "OutreachDraft_recipient_snapshot_privacy" CHECK (
    "recipientSnapshot"->>'rawRecipientStored' = 'false' AND
    "recipientSnapshot"->>'recipientHash' ~ '^[0-9a-f]{64}$' AND
    NOT ("recipientSnapshot" ? 'normalizedValue') AND
    NOT ("recipientSnapshot" ? 'rawValue')
  );

ALTER TABLE "OutreachApproval"
  ADD CONSTRAINT "OutreachApproval_no_send_receipt" CHECK (
    "gateReceipt" @> '{"actualSendPerformed": false, "rawRecipientStored": false}'::jsonb
  );

CREATE UNIQUE INDEX "OutreachDraftRevision_id_draftId_contentHash_key"
  ON "OutreachDraftRevision"("id", "draftId", "contentHash");

ALTER TABLE "OutreachApproval"
  ADD CONSTRAINT "OutreachApproval_content_matches_revision_fkey"
  FOREIGN KEY ("revisionId", "draftId", "contentHash")
  REFERENCES "OutreachDraftRevision"("id", "draftId", "contentHash")
  ON DELETE RESTRICT ON UPDATE CASCADE;
