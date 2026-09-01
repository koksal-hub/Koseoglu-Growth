-- Phase 5 remains test-sandbox only. This migration is additive and does not
-- delete, truncate, rename, or replace existing data.

ALTER TYPE "EventType" ADD VALUE 'SEND_ATTEMPT_PREPARED';
ALTER TYPE "EventType" ADD VALUE 'TEST_PROVIDER_DISPATCH_STARTED';
ALTER TYPE "EventType" ADD VALUE 'TEST_PROVIDER_ACCEPTED';
ALTER TYPE "EventType" ADD VALUE 'TEST_PROVIDER_OUTCOME_UNKNOWN';
ALTER TYPE "EventType" ADD VALUE 'TEST_PROVIDER_FAILED';
ALTER TYPE "EventType" ADD VALUE 'DELIVERY_EVENT_RECORDED';
ALTER TYPE "EventType" ADD VALUE 'REPLY_RECEIPT_RECORDED';

CREATE TYPE "EmailProvider" AS ENUM ('RESEND');
CREATE TYPE "SendRecipientMode" AS ENUM ('TEST_SIMULATION');
CREATE TYPE "SandboxDeliveryScenario" AS ENUM ('DELIVERED', 'BOUNCED', 'COMPLAINED', 'SUPPRESSED');
CREATE TYPE "SendAttemptStatus" AS ENUM (
  'PREPARED',
  'DISPATCHING',
  'ACCEPTED',
  'UNKNOWN',
  'FAILED',
  'DELIVERED',
  'BOUNCED',
  'COMPLAINED',
  'SUPPRESSED'
);
CREATE TYPE "DeliveryEventType" AS ENUM (
  'SENT',
  'DELIVERED',
  'BOUNCED',
  'COMPLAINED',
  'SUPPRESSED',
  'FAILED',
  'DELIVERY_DELAYED'
);
CREATE TYPE "WebhookReceiptOutcome" AS ENUM ('PROCESSED', 'IGNORED');
CREATE TYPE "ReplyClassification" AS ENUM ('UNCLASSIFIED');

CREATE UNIQUE INDEX "OutreachApproval_send_receipt_key"
  ON "OutreachApproval"("id", "draftId", "revisionId", "contentHash");
CREATE UNIQUE INDEX "CommunicationPermission_contact_receipt_key"
  ON "CommunicationPermission"("id", "contactPointId");

CREATE TABLE "SendAttempt" (
  "id" TEXT NOT NULL,
  "draftId" TEXT NOT NULL,
  "approvalId" TEXT NOT NULL,
  "revisionId" TEXT NOT NULL,
  "contactPointId" TEXT NOT NULL,
  "permissionId" TEXT NOT NULL,
  "provider" "EmailProvider" NOT NULL DEFAULT 'RESEND',
  "recipientMode" "SendRecipientMode" NOT NULL DEFAULT 'TEST_SIMULATION',
  "scenario" "SandboxDeliveryScenario" NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "approvedRecipientHash" TEXT NOT NULL,
  "recipientHash" TEXT NOT NULL,
  "gateReceipt" JSONB NOT NULL,
  "status" "SendAttemptStatus" NOT NULL DEFAULT 'PREPARED',
  "providerMessageId" TEXT,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "providerCallPerformed" BOOLEAN NOT NULL DEFAULT false,
  "testMessageSubmitted" BOOLEAN DEFAULT false,
  "customerMessageSubmitted" BOOLEAN NOT NULL DEFAULT false,
  "requestedBy" TEXT NOT NULL,
  "preparedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "dispatchStartedAt" TIMESTAMP(3),
  "providerAcceptedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "failureCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SendAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SendAttempt_idempotency_shape" CHECK (
    length("idempotencyKey") BETWEEN 1 AND 128
    AND "idempotencyKey" ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]*$'
  ),
  CONSTRAINT "SendAttempt_hash_shapes" CHECK (
    "payloadHash" ~ '^[0-9a-f]{64}$'
    AND "contentHash" ~ '^[0-9a-f]{64}$'
    AND "approvedRecipientHash" ~ '^[0-9a-f]{64}$'
    AND "recipientHash" ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "SendAttempt_test_recipient_is_distinct" CHECK (
    "recipientMode" = 'TEST_SIMULATION'
    AND "recipientHash" <> "approvedRecipientHash"
  ),
  CONSTRAINT "SendAttempt_no_customer_send" CHECK ("customerMessageSubmitted" = false),
  CONSTRAINT "SendAttempt_gate_receipt_safe" CHECK (
    "gateReceipt" @> '{"decision":"ALLOW","rawRecipientStored":false,"customerMessageSubmitted":false}'::jsonb
    AND NOT ("gateReceipt" ?| ARRAY['normalizedValue', 'rawValue', 'recipient'])
  ),
  CONSTRAINT "SendAttempt_timeline" CHECK (
    "expiresAt" > "preparedAt"
    AND ("dispatchStartedAt" IS NULL OR "dispatchStartedAt" >= "preparedAt")
    AND ("providerAcceptedAt" IS NULL OR "providerAcceptedAt" >= "preparedAt")
    AND ("failedAt" IS NULL OR "failedAt" >= "preparedAt")
  ),
  CONSTRAINT "SendAttempt_attempt_count" CHECK ("attemptCount" >= 0),
  CONSTRAINT "SendAttempt_state_shape" CHECK (
    ("status" = 'PREPARED'
      AND "attemptCount" = 0
      AND "providerCallPerformed" = false
      AND "testMessageSubmitted" = false
      AND "providerMessageId" IS NULL
      AND "dispatchStartedAt" IS NULL
      AND "providerAcceptedAt" IS NULL
      AND "failedAt" IS NULL
      AND "failureCode" IS NULL)
    OR ("status" = 'DISPATCHING'
      AND "attemptCount" > 0
      AND "providerCallPerformed" = false
      AND "testMessageSubmitted" = false
      AND "providerMessageId" IS NULL
      AND "dispatchStartedAt" IS NOT NULL
      AND "providerAcceptedAt" IS NULL
      AND "failedAt" IS NULL
      AND "failureCode" IS NULL)
    OR ("status" = 'ACCEPTED'
      AND "attemptCount" > 0
      AND "providerCallPerformed" = true
      AND "testMessageSubmitted" = true
      AND "providerMessageId" IS NOT NULL
      AND "dispatchStartedAt" IS NOT NULL
      AND "providerAcceptedAt" IS NOT NULL
      AND "failedAt" IS NULL
      AND "failureCode" IS NULL)
    OR ("status" = 'UNKNOWN'
      AND "attemptCount" > 0
      AND "providerCallPerformed" = true
      AND "testMessageSubmitted" IS NULL
      AND "providerMessageId" IS NULL
      AND "dispatchStartedAt" IS NOT NULL
      AND "providerAcceptedAt" IS NULL
      AND "failedAt" IS NULL
      AND "failureCode" IS NOT NULL)
    OR ("status" = 'FAILED'
      AND "attemptCount" > 0
      AND "providerCallPerformed" = true
      AND "dispatchStartedAt" IS NOT NULL
      AND "failedAt" IS NOT NULL
      AND "failureCode" IS NOT NULL
      AND (
        ("testMessageSubmitted" = false AND "providerMessageId" IS NULL AND "providerAcceptedAt" IS NULL)
        OR ("testMessageSubmitted" = true AND "providerMessageId" IS NOT NULL AND "providerAcceptedAt" IS NOT NULL)
      ))
    OR ("status" IN ('DELIVERED', 'BOUNCED', 'COMPLAINED', 'SUPPRESSED')
      AND "attemptCount" > 0
      AND "providerCallPerformed" = true
      AND "testMessageSubmitted" = true
      AND "providerMessageId" IS NOT NULL
      AND "dispatchStartedAt" IS NOT NULL
      AND "providerAcceptedAt" IS NOT NULL)
  )
);

CREATE TABLE "ProviderWebhookReceipt" (
  "id" TEXT NOT NULL,
  "provider" "EmailProvider" NOT NULL,
  "providerEventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "providerCreatedAt" TIMESTAMP(3) NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL,
  "outcome" "WebhookReceiptOutcome" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProviderWebhookReceipt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProviderWebhookReceipt_event_shape" CHECK (
    length("providerEventId") BETWEEN 1 AND 200
    AND "providerEventId" ~ '^[A-Za-z0-9_-]+$'
    AND "eventType" ~ '^email\.[a-z_]+$'
    AND "payloadHash" ~ '^[0-9a-f]{64}$'
  )
);

CREATE TABLE "DeliveryEvent" (
  "id" TEXT NOT NULL,
  "sendAttemptId" TEXT NOT NULL,
  "webhookReceiptId" TEXT NOT NULL,
  "type" "DeliveryEventType" NOT NULL,
  "providerMessageId" TEXT NOT NULL,
  "recipientHash" TEXT NOT NULL,
  "receipt" JSONB NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DeliveryEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DeliveryEvent_hash_shape" CHECK ("recipientHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "DeliveryEvent_receipt_safe" CHECK (
    "receipt" @> '{"rawPayloadStored":false,"rawRecipientStored":false,"customerMessageSubmitted":false}'::jsonb
    AND NOT ("receipt" ?| ARRAY['normalizedValue', 'rawValue', 'recipient'])
  )
);

CREATE TABLE "Reply" (
  "id" TEXT NOT NULL,
  "sendAttemptId" TEXT,
  "webhookReceiptId" TEXT NOT NULL,
  "providerEmailId" TEXT NOT NULL,
  "messageIdHash" TEXT NOT NULL,
  "senderHash" TEXT NOT NULL,
  "recipientHash" TEXT NOT NULL,
  "subjectHash" TEXT NOT NULL,
  "classification" "ReplyClassification" NOT NULL DEFAULT 'UNCLASSIFIED',
  "receipt" JSONB NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Reply_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Reply_hash_shapes" CHECK (
    "messageIdHash" ~ '^[0-9a-f]{64}$'
    AND "senderHash" ~ '^[0-9a-f]{64}$'
    AND "recipientHash" ~ '^[0-9a-f]{64}$'
    AND "subjectHash" ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "Reply_receipt_safe" CHECK (
    "receipt" @> '{"rawPayloadStored":false,"rawAddressesStored":false,"bodyRetrieved":false}'::jsonb
    AND NOT ("receipt" ?| ARRAY['from', 'to', 'subject', 'body', 'html', 'text'])
  )
);

CREATE UNIQUE INDEX "SendAttempt_idempotencyKey_key" ON "SendAttempt"("idempotencyKey");
CREATE UNIQUE INDEX "SendAttempt_providerMessageId_key" ON "SendAttempt"("providerMessageId");
CREATE UNIQUE INDEX "SendAttempt_id_recipientHash_key" ON "SendAttempt"("id", "recipientHash");
CREATE UNIQUE INDEX "SendAttempt_id_providerMessageId_key" ON "SendAttempt"("id", "providerMessageId");
CREATE INDEX "SendAttempt_draftId_status_idx" ON "SendAttempt"("draftId", "status");
CREATE INDEX "SendAttempt_approvalId_idx" ON "SendAttempt"("approvalId");
CREATE INDEX "SendAttempt_revisionId_idx" ON "SendAttempt"("revisionId");
CREATE INDEX "SendAttempt_contactPointId_idx" ON "SendAttempt"("contactPointId");
CREATE INDEX "SendAttempt_permissionId_idx" ON "SendAttempt"("permissionId");
CREATE INDEX "SendAttempt_expiresAt_idx" ON "SendAttempt"("expiresAt");

CREATE UNIQUE INDEX "ProviderWebhookReceipt_provider_providerEventId_key"
  ON "ProviderWebhookReceipt"("provider", "providerEventId");
CREATE INDEX "ProviderWebhookReceipt_providerCreatedAt_idx" ON "ProviderWebhookReceipt"("providerCreatedAt");
CREATE INDEX "ProviderWebhookReceipt_eventType_idx" ON "ProviderWebhookReceipt"("eventType");

CREATE UNIQUE INDEX "DeliveryEvent_webhookReceiptId_key" ON "DeliveryEvent"("webhookReceiptId");
CREATE INDEX "DeliveryEvent_sendAttemptId_occurredAt_idx" ON "DeliveryEvent"("sendAttemptId", "occurredAt");
CREATE INDEX "DeliveryEvent_type_idx" ON "DeliveryEvent"("type");

CREATE UNIQUE INDEX "Reply_webhookReceiptId_key" ON "Reply"("webhookReceiptId");
CREATE INDEX "Reply_sendAttemptId_receivedAt_idx" ON "Reply"("sendAttemptId", "receivedAt");
CREATE INDEX "Reply_receivedAt_idx" ON "Reply"("receivedAt");

ALTER TABLE "SendAttempt" ADD CONSTRAINT "SendAttempt_approval_receipt_fkey"
  FOREIGN KEY ("approvalId", "draftId", "revisionId", "contentHash")
  REFERENCES "OutreachApproval"("id", "draftId", "revisionId", "contentHash")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SendAttempt" ADD CONSTRAINT "SendAttempt_contact_permission_fkey"
  FOREIGN KEY ("permissionId", "contactPointId")
  REFERENCES "CommunicationPermission"("id", "contactPointId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SendAttempt" ADD CONSTRAINT "SendAttempt_contactPointId_fkey"
  FOREIGN KEY ("contactPointId") REFERENCES "ContactPoint"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DeliveryEvent" ADD CONSTRAINT "DeliveryEvent_attempt_recipient_fkey"
  FOREIGN KEY ("sendAttemptId", "recipientHash")
  REFERENCES "SendAttempt"("id", "recipientHash")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryEvent" ADD CONSTRAINT "DeliveryEvent_attempt_message_fkey"
  FOREIGN KEY ("sendAttemptId", "providerMessageId")
  REFERENCES "SendAttempt"("id", "providerMessageId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryEvent" ADD CONSTRAINT "DeliveryEvent_webhookReceiptId_fkey"
  FOREIGN KEY ("webhookReceiptId") REFERENCES "ProviderWebhookReceipt"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Reply" ADD CONSTRAINT "Reply_sendAttemptId_fkey"
  FOREIGN KEY ("sendAttemptId") REFERENCES "SendAttempt"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Reply" ADD CONSTRAINT "Reply_webhookReceiptId_fkey"
  FOREIGN KEY ("webhookReceiptId") REFERENCES "ProviderWebhookReceipt"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "enforce_send_attempt_update"()
RETURNS trigger AS $$
BEGIN
  IF ROW(
    OLD."draftId", OLD."approvalId", OLD."revisionId", OLD."contactPointId", OLD."permissionId",
    OLD."provider", OLD."recipientMode", OLD."scenario", OLD."idempotencyKey", OLD."payloadHash",
    OLD."contentHash", OLD."approvedRecipientHash", OLD."recipientHash", OLD."gateReceipt",
    OLD."customerMessageSubmitted", OLD."requestedBy", OLD."preparedAt", OLD."expiresAt", OLD."createdAt"
  ) IS DISTINCT FROM ROW(
    NEW."draftId", NEW."approvalId", NEW."revisionId", NEW."contactPointId", NEW."permissionId",
    NEW."provider", NEW."recipientMode", NEW."scenario", NEW."idempotencyKey", NEW."payloadHash",
    NEW."contentHash", NEW."approvedRecipientHash", NEW."recipientHash", NEW."gateReceipt",
    NEW."customerMessageSubmitted", NEW."requestedBy", NEW."preparedAt", NEW."expiresAt", NEW."createdAt"
  ) THEN
    RAISE EXCEPTION 'SendAttempt immutable receipt fields cannot be updated';
  END IF;

  IF NOT (
    (OLD."status" = 'PREPARED' AND NEW."status" = 'DISPATCHING')
    OR (OLD."status" = 'DISPATCHING' AND NEW."status" IN ('ACCEPTED', 'UNKNOWN', 'FAILED'))
    OR (OLD."status" = 'UNKNOWN' AND NEW."status" = 'DISPATCHING')
    OR (OLD."status" = 'ACCEPTED' AND NEW."status" IN ('DELIVERED', 'BOUNCED', 'COMPLAINED', 'SUPPRESSED', 'FAILED'))
    OR (OLD."status" = 'DELIVERED' AND NEW."status" = 'COMPLAINED')
    OR (OLD."status" = NEW."status")
  ) THEN
    RAISE EXCEPTION 'Illegal SendAttempt status transition: % -> %', OLD."status", NEW."status";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "SendAttempt_update_guard"
BEFORE UPDATE ON "SendAttempt"
FOR EACH ROW EXECUTE FUNCTION "enforce_send_attempt_update"();

CREATE OR REPLACE FUNCTION "reject_email_receipt_update"()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ProviderWebhookReceipt_append_only_guard"
BEFORE UPDATE ON "ProviderWebhookReceipt"
FOR EACH ROW EXECUTE FUNCTION "reject_email_receipt_update"();
CREATE TRIGGER "DeliveryEvent_append_only_guard"
BEFORE UPDATE ON "DeliveryEvent"
FOR EACH ROW EXECUTE FUNCTION "reject_email_receipt_update"();
CREATE TRIGGER "Reply_append_only_guard"
BEFORE UPDATE ON "Reply"
FOR EACH ROW EXECUTE FUNCTION "reject_email_receipt_update"();
