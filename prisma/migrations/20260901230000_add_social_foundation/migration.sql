-- Additive Phase 8A social foundation. No provider credentials or external
-- publication state is activated by this migration.
CREATE TYPE "SocialPlatform" AS ENUM ('LINKEDIN', 'INSTAGRAM', 'FACEBOOK', 'X', 'THREADS', 'TIKTOK', 'YOUTUBE', 'GOOGLE_BUSINESS', 'PINTEREST');
CREATE TYPE "SocialConnectionStatus" AS ENUM ('DISCONNECTED', 'CONNECTED', 'REAUTH_REQUIRED', 'REVOKED');
CREATE TYPE "SocialMasterContentStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'ARCHIVED');
CREATE TYPE "SocialContentVariantStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'DEAD_LETTER', 'CANCELLED');

CREATE TABLE "SocialConnection" (
    "id" TEXT NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "accountKey" TEXT NOT NULL,
    "accountLabel" TEXT,
    "status" "SocialConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "secretManagerRef" TEXT,
    "scopes" JSONB,
    "tokenExpiresAt" TIMESTAMP(3),
    "lastValidatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SocialConnection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SocialConnection_platform_accountKey_key" ON "SocialConnection"("platform", "accountKey");
CREATE INDEX "SocialConnection_platform_status_idx" ON "SocialConnection"("platform", "status");

CREATE TABLE "MasterContent" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "campaignKey" TEXT,
    "status" "SocialMasterContentStatus" NOT NULL DEFAULT 'DRAFT',
    "author" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MasterContent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MasterContent_status_createdAt_idx" ON "MasterContent"("status", "createdAt");
CREATE INDEX "MasterContent_campaignKey_idx" ON "MasterContent"("campaignKey");
ALTER TABLE "MasterContent" ADD CONSTRAINT "MasterContent_approval_author_guard"
  CHECK ("approvedBy" IS NULL OR "approvedBy" <> "author");

CREATE TABLE "SocialContentVariant" (
    "id" TEXT NOT NULL,
    "masterContentId" TEXT NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "body" TEXT NOT NULL,
    "mediaManifest" JSONB,
    "contentHash" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "validationReceipt" JSONB NOT NULL,
    "status" "SocialContentVariantStatus" NOT NULL DEFAULT 'DRAFT',
    "author" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "scheduledAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "providerPostId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SocialContentVariant_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SocialContentVariant_masterContentId_fkey" FOREIGN KEY ("masterContentId") REFERENCES "MasterContent"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SocialContentVariant_idempotencyKey_key" ON "SocialContentVariant"("idempotencyKey");
CREATE UNIQUE INDEX "SocialContentVariant_masterContentId_platform_key" ON "SocialContentVariant"("masterContentId", "platform");
CREATE INDEX "SocialContentVariant_platform_status_scheduledAt_idx" ON "SocialContentVariant"("platform", "status", "scheduledAt");
CREATE INDEX "SocialContentVariant_contentHash_idx" ON "SocialContentVariant"("contentHash");
ALTER TABLE "SocialContentVariant" ADD CONSTRAINT "SocialContentVariant_approval_author_guard"
  CHECK ("approvedBy" IS NULL OR "approvedBy" <> "author");
