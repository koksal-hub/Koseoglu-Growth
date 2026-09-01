ALTER TYPE "EventType" ADD VALUE 'OUTREACH_DRAFT_CREATED';
ALTER TYPE "EventType" ADD VALUE 'OUTREACH_DRAFT_REVISED';
ALTER TYPE "EventType" ADD VALUE 'OUTREACH_REVIEW_REQUESTED';
ALTER TYPE "EventType" ADD VALUE 'OUTREACH_APPROVAL_RECORDED';
ALTER TYPE "EventType" ADD VALUE 'OUTREACH_DRAFT_EXPIRED';

CREATE TYPE "OutreachDraftStatus" AS ENUM (
  'DRAFT',
  'IN_REVIEW',
  'APPROVED',
  'REJECTED',
  'EXPIRED'
);

CREATE TYPE "OutreachApprovalDecision" AS ENUM ('APPROVED', 'REJECTED');

CREATE TABLE "OutreachDraft" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "contactPointId" TEXT NOT NULL,
    "rankingReceiptId" TEXT NOT NULL,
    "channel" "CommunicationChannel" NOT NULL,
    "purpose" "CommunicationPurpose" NOT NULL,
    "jurisdictionCountry" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "templateVersion" TEXT NOT NULL,
    "generationMethod" TEXT NOT NULL DEFAULT 'HUMAN_AUTHORED',
    "author" TEXT NOT NULL,
    "recipientSnapshot" JSONB NOT NULL,
    "status" "OutreachDraftStatus" NOT NULL DEFAULT 'DRAFT',
    "currentRevisionNumber" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "submittedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutreachDraft_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "OutreachDraft_email_only" CHECK ("channel" = 'EMAIL'),
    CONSTRAINT "OutreachDraft_country_shape" CHECK ("jurisdictionCountry" ~ '^[A-Z]{2}$'),
    CONSTRAINT "OutreachDraft_text_shape" CHECK (
      length(btrim("policyVersion")) > 0 AND
      length(btrim("templateKey")) > 0 AND
      length(btrim("templateVersion")) > 0 AND
      length(btrim("author")) > 0
    ),
    CONSTRAINT "OutreachDraft_human_authored" CHECK ("generationMethod" = 'HUMAN_AUTHORED'),
    CONSTRAINT "OutreachDraft_revision_positive" CHECK ("currentRevisionNumber" >= 1),
    CONSTRAINT "OutreachDraft_expiry_after_creation" CHECK ("expiresAt" > "createdAt"),
    CONSTRAINT "OutreachDraft_recipient_snapshot_object" CHECK (jsonb_typeof("recipientSnapshot") = 'object'),
    CONSTRAINT "OutreachDraft_submission_shape" CHECK (
      ("status" = 'DRAFT' AND "submittedAt" IS NULL AND "submittedBy" IS NULL) OR
      ("status" <> 'DRAFT' AND "submittedAt" IS NOT NULL AND length(btrim("submittedBy")) > 0)
    )
);

CREATE TABLE "OutreachDraftRevision" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "editedBy" TEXT NOT NULL,
    "editReason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutreachDraftRevision_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "OutreachDraftRevision_revision_positive" CHECK ("revisionNumber" >= 1),
    CONSTRAINT "OutreachDraftRevision_content_shape" CHECK (
      length(btrim("subject")) BETWEEN 1 AND 200 AND
      length(btrim("body")) BETWEEN 1 AND 20000 AND
      length(btrim("editedBy")) > 0 AND
      length(btrim("editReason")) > 0
    ),
    CONSTRAINT "OutreachDraftRevision_hash_shape" CHECK ("contentHash" ~ '^[0-9a-f]{64}$')
);

CREATE TABLE "OutreachApproval" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "decision" "OutreachApprovalDecision" NOT NULL,
    "decisionReason" TEXT NOT NULL,
    "reviewedBy" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "permissionId" TEXT,
    "gateReceipt" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutreachApproval_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "OutreachApproval_text_shape" CHECK (
      length(btrim("decisionReason")) > 0 AND
      length(btrim("reviewedBy")) > 0 AND
      length(btrim("policyVersion")) > 0
    ),
    CONSTRAINT "OutreachApproval_hash_shape" CHECK ("contentHash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "OutreachApproval_gate_receipt_object" CHECK (jsonb_typeof("gateReceipt") = 'object'),
    CONSTRAINT "OutreachApproval_approved_permission_required" CHECK (
      "decision" <> 'APPROVED' OR "permissionId" IS NOT NULL
    )
);

CREATE INDEX "OutreachDraft_companyId_status_idx" ON "OutreachDraft"("companyId", "status");
CREATE INDEX "OutreachDraft_contactPointId_idx" ON "OutreachDraft"("contactPointId");
CREATE INDEX "OutreachDraft_rankingReceiptId_idx" ON "OutreachDraft"("rankingReceiptId");
CREATE INDEX "OutreachDraft_expiresAt_idx" ON "OutreachDraft"("expiresAt");
CREATE UNIQUE INDEX "OutreachDraftRevision_draftId_revisionNumber_key"
  ON "OutreachDraftRevision"("draftId", "revisionNumber");
CREATE UNIQUE INDEX "OutreachDraftRevision_id_draftId_key"
  ON "OutreachDraftRevision"("id", "draftId");
CREATE INDEX "OutreachDraftRevision_contentHash_idx" ON "OutreachDraftRevision"("contentHash");
CREATE UNIQUE INDEX "OutreachApproval_draftId_key" ON "OutreachApproval"("draftId");
CREATE UNIQUE INDEX "OutreachApproval_revisionId_key" ON "OutreachApproval"("revisionId");
CREATE INDEX "OutreachApproval_decision_decidedAt_idx" ON "OutreachApproval"("decision", "decidedAt");
CREATE INDEX "OutreachApproval_permissionId_idx" ON "OutreachApproval"("permissionId");

ALTER TABLE "OutreachDraft"
  ADD CONSTRAINT "OutreachDraft_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OutreachDraft"
  ADD CONSTRAINT "OutreachDraft_contactPointId_fkey"
  FOREIGN KEY ("contactPointId") REFERENCES "ContactPoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OutreachDraft"
  ADD CONSTRAINT "OutreachDraft_rankingReceiptId_fkey"
  FOREIGN KEY ("rankingReceiptId") REFERENCES "CompanyRankingReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OutreachDraftRevision"
  ADD CONSTRAINT "OutreachDraftRevision_draftId_fkey"
  FOREIGN KEY ("draftId") REFERENCES "OutreachDraft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OutreachApproval"
  ADD CONSTRAINT "OutreachApproval_draftId_fkey"
  FOREIGN KEY ("draftId") REFERENCES "OutreachDraft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OutreachApproval"
  ADD CONSTRAINT "OutreachApproval_revisionId_fkey"
  FOREIGN KEY ("revisionId") REFERENCES "OutreachDraftRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OutreachApproval"
  ADD CONSTRAINT "OutreachApproval_revision_belongs_to_draft_fkey"
  FOREIGN KEY ("revisionId", "draftId") REFERENCES "OutreachDraftRevision"("id", "draftId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OutreachApproval"
  ADD CONSTRAINT "OutreachApproval_permissionId_fkey"
  FOREIGN KEY ("permissionId") REFERENCES "CommunicationPermission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
