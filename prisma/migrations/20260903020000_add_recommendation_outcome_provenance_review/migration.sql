-- CreateEnum
CREATE TYPE "RecommendationOutcomeProvenanceDecision" AS ENUM ('APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "RecommendationOutcomeProvenanceReview" (
    "id" TEXT NOT NULL,
    "reviewKey" TEXT NOT NULL,
    "outcomeId" TEXT NOT NULL,
    "decision" "RecommendationOutcomeProvenanceDecision" NOT NULL,
    "reviewedBy" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecommendationOutcomeProvenanceReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RecommendationOutcomeProvenanceReview_reviewKey_key" ON "RecommendationOutcomeProvenanceReview"("reviewKey");

-- CreateIndex
CREATE UNIQUE INDEX "RecommendationOutcomeProvenanceReview_outcomeId_key" ON "RecommendationOutcomeProvenanceReview"("outcomeId");

-- CreateIndex
CREATE INDEX "RecommendationOutcomeProvenanceReview_decision_reviewedAt_idx" ON "RecommendationOutcomeProvenanceReview"("decision", "reviewedAt");

-- AddForeignKey
ALTER TABLE "RecommendationOutcomeProvenanceReview" ADD CONSTRAINT "RecommendationOutcomeProvenanceReview_outcomeId_fkey" FOREIGN KEY ("outcomeId") REFERENCES "RecommendationOutcome"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
