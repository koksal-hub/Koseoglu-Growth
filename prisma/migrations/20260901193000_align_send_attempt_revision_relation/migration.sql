-- Represent the exact revision/content receipt relation in both Prisma and SQL.

ALTER TABLE "SendAttempt" ADD CONSTRAINT "SendAttempt_revision_receipt_fkey"
  FOREIGN KEY ("revisionId", "draftId", "contentHash")
  REFERENCES "OutreachDraftRevision"("id", "draftId", "contentHash")
  ON DELETE RESTRICT ON UPDATE CASCADE;
