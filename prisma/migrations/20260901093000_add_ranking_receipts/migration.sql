ALTER TYPE "EventType" ADD VALUE 'COMPANY_RANKING_RECORDED';

CREATE TYPE "DailyActionType" AS ENUM (
  'VERIFY_COMPANY',
  'COLLECT_EVIDENCE',
  'VERIFY_CONTACT_POINT',
  'REVIEW_COMMUNICATION_PERMISSION',
  'HONOR_SUPPRESSION',
  'READY_FOR_HUMAN_OUTREACH_REVIEW'
);

CREATE TABLE "CompanyRankingReceipt" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "algorithmVersion" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "context" JSONB NOT NULL,
    "evidenceReceipt" JSONB NOT NULL,
    "contactReceipt" JSONB NOT NULL,
    "icpFitScore" INTEGER NOT NULL,
    "companyConfidenceScore" INTEGER NOT NULL,
    "evidenceScore" INTEGER NOT NULL,
    "contactScore" INTEGER NOT NULL,
    "permissionScore" INTEGER NOT NULL,
    "totalScore" INTEGER NOT NULL,
    "reasonCodes" JSONB NOT NULL,
    "nextAction" "DailyActionType" NOT NULL,
    "evaluatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyRankingReceipt_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CompanyRankingReceipt_component_ranges" CHECK (
      "icpFitScore" BETWEEN 0 AND 20 AND
      "companyConfidenceScore" BETWEEN 0 AND 20 AND
      "evidenceScore" BETWEEN 0 AND 20 AND
      "contactScore" BETWEEN 0 AND 20 AND
      "permissionScore" BETWEEN 0 AND 20
    ),
    CONSTRAINT "CompanyRankingReceipt_total_range" CHECK ("totalScore" BETWEEN 0 AND 100),
    CONSTRAINT "CompanyRankingReceipt_total_sum" CHECK (
      "totalScore" = "icpFitScore" + "companyConfidenceScore" +
      "evidenceScore" + "contactScore" + "permissionScore"
    ),
    CONSTRAINT "CompanyRankingReceipt_hash_shape" CHECK ("inputHash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "CompanyRankingReceipt_version_shape" CHECK (
      length(btrim("algorithmVersion")) > 0 AND length(btrim("policyVersion")) > 0
    ),
    CONSTRAINT "CompanyRankingReceipt_actor_shape" CHECK (length(btrim("createdBy")) > 0)
);

CREATE UNIQUE INDEX "CompanyRankingReceipt_companyId_algorithmVersion_inputHash_key"
  ON "CompanyRankingReceipt"("companyId", "algorithmVersion", "inputHash");
CREATE INDEX "CompanyRankingReceipt_policyVersion_evaluatedAt_idx"
  ON "CompanyRankingReceipt"("policyVersion", "evaluatedAt");
CREATE INDEX "CompanyRankingReceipt_totalScore_idx" ON "CompanyRankingReceipt"("totalScore");
CREATE INDEX "CompanyRankingReceipt_nextAction_idx" ON "CompanyRankingReceipt"("nextAction");

ALTER TABLE "CompanyRankingReceipt"
  ADD CONSTRAINT "CompanyRankingReceipt_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
