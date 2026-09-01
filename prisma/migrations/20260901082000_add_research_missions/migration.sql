-- Extend the immutable event vocabulary for Research Mission lifecycle events.
ALTER TYPE "EventType" ADD VALUE 'RESEARCH_MISSION_CREATED';
ALTER TYPE "EventType" ADD VALUE 'RESEARCH_CANDIDATE_PROPOSED';
ALTER TYPE "EventType" ADD VALUE 'RESEARCH_CANDIDATE_ACCEPTED';
ALTER TYPE "EventType" ADD VALUE 'RESEARCH_CANDIDATE_REJECTED';
ALTER TYPE "EventType" ADD VALUE 'RESEARCH_CANDIDATE_NEEDS_EVIDENCE';

CREATE TYPE "ResearchMissionStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');
CREATE TYPE "ResearchCandidateStatus" AS ENUM ('PROPOSED', 'NEEDS_MORE_EVIDENCE', 'ACCEPTED', 'REJECTED');
CREATE TYPE "EvidenceFreshnessStatus" AS ENUM ('CURRENT', 'STALE', 'UNKNOWN');

CREATE TABLE "ResearchMission" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "country" TEXT,
    "region" TEXT,
    "sector" TEXT,
    "route" TEXT,
    "status" "ResearchMissionStatus" NOT NULL DEFAULT 'ACTIVE',
    "budgetLimit" DECIMAL(14,2),
    "budgetCurrency" TEXT NOT NULL DEFAULT 'TRY',
    "owner" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResearchMission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ResearchCandidate" (
    "id" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "companyId" TEXT,
    "matchedCompanyId" TEXT,
    "proposedName" TEXT NOT NULL,
    "taxNumber" TEXT,
    "domain" TEXT,
    "phone" TEXT,
    "emailDomain" TEXT,
    "country" TEXT,
    "city" TEXT,
    "address" TEXT,
    "sector" TEXT,
    "website" TEXT,
    "reason" TEXT NOT NULL,
    "status" "ResearchCandidateStatus" NOT NULL DEFAULT 'PROPOSED',
    "confidence" DOUBLE PRECISION NOT NULL,
    "matchedBy" TEXT,
    "matchConfidence" DOUBLE PRECISION,
    "decisionReason" TEXT,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResearchCandidate_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ResearchCandidate_confidence_range" CHECK ("confidence" >= 0 AND "confidence" <= 1),
    CONSTRAINT "ResearchCandidate_match_confidence_range" CHECK ("matchConfidence" IS NULL OR ("matchConfidence" >= 0 AND "matchConfidence" <= 1))
);

ALTER TABLE "Evidence"
  ADD COLUMN "candidateId" TEXT,
  ADD COLUMN "observedAt" TIMESTAMP(3),
  ADD COLUMN "claimKey" TEXT,
  ADD COLUMN "freshnessStatus" "EvidenceFreshnessStatus" NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "legalNotes" TEXT;

CREATE INDEX "ResearchMission_status_idx" ON "ResearchMission"("status");
CREATE INDEX "ResearchMission_owner_idx" ON "ResearchMission"("owner");
CREATE INDEX "ResearchMission_createdAt_idx" ON "ResearchMission"("createdAt");
CREATE INDEX "ResearchCandidate_missionId_idx" ON "ResearchCandidate"("missionId");
CREATE INDEX "ResearchCandidate_companyId_idx" ON "ResearchCandidate"("companyId");
CREATE INDEX "ResearchCandidate_matchedCompanyId_idx" ON "ResearchCandidate"("matchedCompanyId");
CREATE INDEX "ResearchCandidate_status_idx" ON "ResearchCandidate"("status");
CREATE INDEX "Evidence_candidateId_idx" ON "Evidence"("candidateId");
CREATE INDEX "Evidence_claimKey_idx" ON "Evidence"("claimKey");

ALTER TABLE "ResearchCandidate"
  ADD CONSTRAINT "ResearchCandidate_missionId_fkey"
  FOREIGN KEY ("missionId") REFERENCES "ResearchMission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ResearchCandidate"
  ADD CONSTRAINT "ResearchCandidate_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ResearchCandidate"
  ADD CONSTRAINT "ResearchCandidate_matchedCompanyId_fkey"
  FOREIGN KEY ("matchedCompanyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Evidence"
  ADD CONSTRAINT "Evidence_candidateId_fkey"
  FOREIGN KEY ("candidateId") REFERENCES "ResearchCandidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
