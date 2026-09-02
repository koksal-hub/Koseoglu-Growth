-- CreateEnum
CREATE TYPE "RecommendationOutcomeSourceType" AS ENUM ('CRM_LEAD', 'CRM_OPPORTUNITY', 'CRM_EVENT', 'HUMAN_NOTE', 'OPERATIONS_RECORD');

-- AlterTable
ALTER TABLE "RecommendationOutcome" ADD COLUMN "sourceType" "RecommendationOutcomeSourceType";
ALTER TABLE "RecommendationOutcome" ADD COLUMN "sourceId" TEXT;

-- CreateIndex
CREATE INDEX "RecommendationOutcome_sourceType_sourceId_idx" ON "RecommendationOutcome"("sourceType", "sourceId");
