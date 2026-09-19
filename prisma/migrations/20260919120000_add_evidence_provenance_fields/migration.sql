-- Additive provenance fields for Evidence (L0-provenance-readiness).
-- No backfill: historical rows keep NULL availableAt / NULL evidenceGroupKey and
-- the honest UNKNOWN dataOrigin. Nothing is renamed, dropped or rewritten.

CREATE TYPE "EvidenceDataOrigin" AS ENUM (
  'UNKNOWN',
  'HUMAN_OBSERVATION',
  'CUSTOMER_BEHAVIOR',
  'EXTERNAL_EVIDENCE',
  'AI_INFERENCE',
  'SYNTHETIC',
  'AUGMENTED',
  'AI_RECOMMENDATION',
  'HUMAN_DECISION',
  'ACTUAL_COMMERCIAL_OUTCOME'
);

ALTER TABLE "Evidence" ADD COLUMN "availableAt" TIMESTAMP(3);
ALTER TABLE "Evidence" ADD COLUMN "dataOrigin" "EvidenceDataOrigin" NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE "Evidence" ADD COLUMN "evidenceGroupKey" TEXT;