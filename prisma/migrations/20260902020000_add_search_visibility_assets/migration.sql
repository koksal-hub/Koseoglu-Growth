-- CreateEnum
CREATE TYPE "VisibilityMode" AS ENUM ('SEO', 'GEO');

-- CreateEnum
CREATE TYPE "VisibilityRobotsDirective" AS ENUM ('INDEX_FOLLOW', 'NOINDEX_NOFOLLOW');

-- CreateEnum
CREATE TYPE "VisibilityAssetStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "SearchVisibilityAsset" (
    "id" TEXT NOT NULL,
    "assetKey" TEXT NOT NULL,
    "mode" "VisibilityMode" NOT NULL,
    "locale" TEXT NOT NULL,
    "canonicalUrl" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "targetIntents" JSONB NOT NULL,
    "structuredData" JSONB,
    "robots" "VisibilityRobotsDirective" NOT NULL DEFAULT 'INDEX_FOLLOW',
    "contentHash" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "validationReceipt" JSONB NOT NULL,
    "status" "VisibilityAssetStatus" NOT NULL DEFAULT 'DRAFT',
    "author" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SearchVisibilityAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SearchVisibilityAsset_assetKey_key" ON "SearchVisibilityAsset"("assetKey");

-- CreateIndex
CREATE UNIQUE INDEX "SearchVisibilityAsset_mode_locale_canonicalUrl_key" ON "SearchVisibilityAsset"("mode", "locale", "canonicalUrl");

-- CreateIndex
CREATE INDEX "SearchVisibilityAsset_mode_status_locale_idx" ON "SearchVisibilityAsset"("mode", "status", "locale");

-- CreateIndex
CREATE INDEX "SearchVisibilityAsset_contentHash_idx" ON "SearchVisibilityAsset"("contentHash");
