-- Additive research signal storage. Existing company/candidate data is preserved.
ALTER TYPE "EventType" ADD VALUE 'RESEARCH_EVIDENCE_ADDED';

ALTER TABLE "Company" ADD COLUMN "activity" TEXT;
ALTER TABLE "ResearchCandidate" ADD COLUMN "activity" TEXT;
