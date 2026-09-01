-- Additive Phase 7 reporting and usage receipt storage. Existing data is preserved.
CREATE TABLE "UsageReceipt" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "receiptHash" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costMinor" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UsageReceipt_idempotencyKey_key" ON "UsageReceipt"("idempotencyKey");
CREATE INDEX "UsageReceipt_occurredAt_idx" ON "UsageReceipt"("occurredAt");
CREATE INDEX "UsageReceipt_provider_model_idx" ON "UsageReceipt"("provider", "model");
ALTER TABLE "UsageReceipt" ADD CONSTRAINT "UsageReceipt_nonnegative_usage"
  CHECK ("inputTokens" >= 0 AND "outputTokens" >= 0 AND "costMinor" >= 0);
ALTER TABLE "UsageReceipt" ADD CONSTRAINT "UsageReceipt_currency_format"
  CHECK ("currency" ~ '^[A-Z]{3}$');

CREATE TABLE "ManagementReport" (
    "id" TEXT NOT NULL,
    "reportKey" TEXT NOT NULL,
    "reportDate" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Istanbul',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "inputHash" TEXT NOT NULL,
    "metrics" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManagementReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ManagementReport_reportKey_key" ON "ManagementReport"("reportKey");
CREATE UNIQUE INDEX "ManagementReport_reportDate_timezone_key" ON "ManagementReport"("reportDate", "timezone");
CREATE INDEX "ManagementReport_periodStart_periodEnd_idx" ON "ManagementReport"("periodStart", "periodEnd");
ALTER TABLE "ManagementReport" ADD CONSTRAINT "ManagementReport_report_date_format"
  CHECK ("reportDate" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$');
ALTER TABLE "ManagementReport" ADD CONSTRAINT "ManagementReport_timezone_fixed"
  CHECK ("timezone" = 'Europe/Istanbul');
