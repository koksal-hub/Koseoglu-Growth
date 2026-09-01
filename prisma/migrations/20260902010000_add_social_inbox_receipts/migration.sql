-- CreateEnum
CREATE TYPE "SocialInboxMessageStatus" AS ENUM ('RECEIVED', 'CLASSIFIED', 'ASSIGNED', 'REQUIRES_APPROVAL', 'RESPONDED', 'IGNORED');

-- CreateEnum
CREATE TYPE "SocialInboxIntent" AS ENUM ('UNCLASSIFIED', 'LEAD', 'CUSTOMER', 'QUESTION', 'COMPLAINT', 'SPAM', 'OTHER');

-- CreateTable
CREATE TABLE "SocialInboxMessage" (
    "id" TEXT NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "accountKey" TEXT NOT NULL,
    "externalMessageKey" TEXT NOT NULL,
    "threadKey" TEXT NOT NULL,
    "senderHandle" TEXT NOT NULL,
    "messageType" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "contentHash" TEXT NOT NULL,
    "intent" "SocialInboxIntent" NOT NULL DEFAULT 'UNCLASSIFIED',
    "status" "SocialInboxMessageStatus" NOT NULL DEFAULT 'RECEIVED',
    "assignedTo" TEXT,
    "classificationReceipt" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialInboxMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SocialInboxMessage_platform_accountKey_externalMessageKey_key" ON "SocialInboxMessage"("platform", "accountKey", "externalMessageKey");

-- CreateIndex
CREATE INDEX "SocialInboxMessage_platform_status_receivedAt_idx" ON "SocialInboxMessage"("platform", "status", "receivedAt");

-- CreateIndex
CREATE INDEX "SocialInboxMessage_threadKey_receivedAt_idx" ON "SocialInboxMessage"("threadKey", "receivedAt");

-- CreateIndex
CREATE INDEX "SocialInboxMessage_intent_status_idx" ON "SocialInboxMessage"("intent", "status");
