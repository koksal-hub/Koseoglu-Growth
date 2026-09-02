-- CreateEnum
CREATE TYPE "RecommendationType" AS ENUM ('LEAD_RANKING', 'RESEARCH_ACTION');

-- CreateEnum
CREATE TYPE "RecommendationExposureMode" AS ENUM ('EXPLOITATION', 'EXPLORATION');

-- CreateEnum
CREATE TYPE "RecommendationOutcomeType" AS ENUM ('HUMAN_ACTION', 'LEAD_CREATED', 'QUOTE_REQUESTED', 'WON_SHIPMENT', 'GROSS_PROFIT');

-- CreateTable
CREATE TABLE "RecommendationExposure" (
    "id" TEXT NOT NULL,
    "exposureKey" TEXT NOT NULL,
    "recommendationType" "RecommendationType" NOT NULL,
    "recommendationId" TEXT NOT NULL,
    "algorithmVersion" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "mode" "RecommendationExposureMode" NOT NULL,
    "position" INTEGER NOT NULL,
    "actor" TEXT NOT NULL,
    "exposedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecommendationExposure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecommendationOutcome" (
    "id" TEXT NOT NULL,
    "exposureId" TEXT NOT NULL,
    "outcomeKey" TEXT NOT NULL,
    "outcomeType" "RecommendationOutcomeType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "valueMinor" INTEGER,
    "currency" TEXT,
    "sourceRef" TEXT,
    "recordedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecommendationOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RecommendationExposure_exposureKey_key" ON "RecommendationExposure"("exposureKey");

-- CreateIndex
CREATE INDEX "RecommendationExposure_recommendationType_recommendationId_exposedAt_idx" ON "RecommendationExposure"("recommendationType", "recommendationId", "exposedAt");

-- CreateIndex
CREATE INDEX "RecommendationExposure_mode_exposedAt_idx" ON "RecommendationExposure"("mode", "exposedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RecommendationOutcome_exposureId_outcomeKey_key" ON "RecommendationOutcome"("exposureId", "outcomeKey");

-- CreateIndex
CREATE INDEX "RecommendationOutcome_outcomeType_occurredAt_idx" ON "RecommendationOutcome"("outcomeType", "occurredAt");

-- CreateIndex
CREATE INDEX "RecommendationOutcome_exposureId_occurredAt_idx" ON "RecommendationOutcome"("exposureId", "occurredAt");

-- AddForeignKey
ALTER TABLE "RecommendationOutcome" ADD CONSTRAINT "RecommendationOutcome_exposureId_fkey" FOREIGN KEY ("exposureId") REFERENCES "RecommendationExposure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddCheckConstraint
ALTER TABLE "RecommendationExposure" ADD CONSTRAINT "RecommendationExposure_position_positive" CHECK ("position" > 0 AND "position" <= 100);

-- AddCheckConstraint
ALTER TABLE "RecommendationOutcome" ADD CONSTRAINT "RecommendationOutcome_value_nonnegative" CHECK ("valueMinor" IS NULL OR "valueMinor" >= 0);
