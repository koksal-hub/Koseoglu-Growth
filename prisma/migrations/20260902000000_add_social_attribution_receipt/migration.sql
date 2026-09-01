-- CreateTable
CREATE TABLE "SocialAttributionReceipt" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "destinationUrl" TEXT NOT NULL,
    "utmSource" TEXT NOT NULL,
    "utmMedium" TEXT NOT NULL,
    "utmCampaign" TEXT NOT NULL,
    "utmContent" TEXT,
    "receiptHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialAttributionReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SocialAttributionReceipt_variantId_key" ON "SocialAttributionReceipt"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "SocialAttributionReceipt_receiptHash_key" ON "SocialAttributionReceipt"("receiptHash");

-- CreateIndex
CREATE INDEX "SocialAttributionReceipt_utmCampaign_idx" ON "SocialAttributionReceipt"("utmCampaign");

-- CreateIndex
CREATE INDEX "SocialAttributionReceipt_utmSource_utmMedium_idx" ON "SocialAttributionReceipt"("utmSource", "utmMedium");

-- AddForeignKey
ALTER TABLE "SocialAttributionReceipt" ADD CONSTRAINT "SocialAttributionReceipt_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "SocialContentVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
