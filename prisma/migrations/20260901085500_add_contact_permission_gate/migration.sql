-- Contact discovery remains separate from permission to communicate.
ALTER TYPE "EventType" ADD VALUE 'CONTACT_POINT_COLLECTED';
ALTER TYPE "EventType" ADD VALUE 'CONTACT_POINT_VERIFIED';
ALTER TYPE "EventType" ADD VALUE 'COMMUNICATION_PERMISSION_RECORDED';
ALTER TYPE "EventType" ADD VALUE 'COMMUNICATION_SUPPRESSED';

CREATE TYPE "ContactPointType" AS ENUM ('EMAIL', 'PHONE');
CREATE TYPE "ContactPointClassification" AS ENUM ('COMPANY_GENERAL', 'PERSON_WORK', 'PERSONAL', 'UNKNOWN');
CREATE TYPE "ContactPointVerificationStatus" AS ENUM ('UNVERIFIED', 'VERIFIED', 'INVALID', 'STALE');
CREATE TYPE "PrivacyNoticeStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'PROVIDED', 'EXEMPTION_RECORDED');
CREATE TYPE "DataProcessingBasis" AS ENUM ('CONSENT', 'CONTRACT', 'LEGAL_OBLIGATION', 'LEGITIMATE_INTEREST', 'PUBLIC_INTEREST', 'VITAL_INTEREST', 'PUBLICIZED_BY_DATA_SUBJECT', 'LEGAL_CLAIM', 'NOT_PERSONAL_DATA', 'UNKNOWN');
CREATE TYPE "CommunicationChannel" AS ENUM ('EMAIL', 'PHONE', 'SMS', 'WHATSAPP');
CREATE TYPE "CommunicationPurpose" AS ENUM ('SALES_OUTREACH', 'MARKETING', 'CUSTOMER_SERVICE');
CREATE TYPE "CommunicationPermissionStatus" AS ENUM ('ALLOWED', 'DENIED', 'OPTED_OUT', 'SUPPRESSED');
CREATE TYPE "CommunicationRule" AS ENUM ('EXPLICIT_CONSENT', 'EXISTING_CUSTOMER', 'B2B_RECIPIENT_EXCEPTION', 'SOFT_OPT_IN', 'OTHER_REVIEWED', 'UNKNOWN');
CREATE TYPE "RecipientCategory" AS ENUM ('LEGAL_ENTITY', 'TRADER_OR_CRAFTSMAN', 'CONSUMER', 'UNKNOWN');

CREATE UNIQUE INDEX "Contact_id_companyId_key" ON "Contact"("id", "companyId");

CREATE TABLE "ContactPoint" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "contactId" TEXT,
    "type" "ContactPointType" NOT NULL,
    "classification" "ContactPointClassification" NOT NULL,
    "normalizedValue" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceName" TEXT,
    "sourceIsPublic" BOOLEAN NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL,
    "observedAt" TIMESTAMP(3),
    "verificationStatus" "ContactPointVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "verificationReason" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL,
    "collectionPurpose" TEXT NOT NULL,
    "dataProcessingBasis" "DataProcessingBasis" NOT NULL,
    "noticeStatus" "PrivacyNoticeStatus" NOT NULL,
    "noticeProvidedAt" TIMESTAMP(3),
    "retentionUntil" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactPoint_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ContactPoint_confidence_range" CHECK ("confidence" >= 0 AND "confidence" <= 1),
    CONSTRAINT "ContactPoint_country_code_shape" CHECK ("countryCode" ~ '^[A-Z]{2}$'),
    CONSTRAINT "ContactPoint_owner_shape" CHECK (
      ("classification" = 'COMPANY_GENERAL' AND "contactId" IS NULL) OR
      ("classification" IN ('PERSON_WORK', 'PERSONAL') AND "contactId" IS NOT NULL) OR
      ("classification" = 'UNKNOWN')
    ),
    CONSTRAINT "ContactPoint_personal_retention_required" CHECK (
      "classification" = 'COMPANY_GENERAL' OR "retentionUntil" IS NOT NULL
    ),
    CONSTRAINT "ContactPoint_personal_basis_shape" CHECK (
      "classification" = 'COMPANY_GENERAL' OR "dataProcessingBasis" <> 'NOT_PERSONAL_DATA'
    ),
    CONSTRAINT "ContactPoint_verification_receipt" CHECK (
      "verificationStatus" <> 'VERIFIED' OR
      ("verifiedAt" IS NOT NULL AND "verifiedBy" IS NOT NULL AND "verificationReason" IS NOT NULL)
    ),
    CONSTRAINT "ContactPoint_observation_order" CHECK (
      "observedAt" IS NULL OR "observedAt" <= "collectedAt"
    ),
    CONSTRAINT "ContactPoint_retention_order" CHECK (
      "retentionUntil" IS NULL OR "retentionUntil" > "collectedAt"
    ),
    CONSTRAINT "ContactPoint_verification_order" CHECK (
      "verifiedAt" IS NULL OR "verifiedAt" >= "collectedAt"
    ),
    CONSTRAINT "ContactPoint_notice_receipt" CHECK (
      "noticeStatus" <> 'PROVIDED' OR "noticeProvidedAt" IS NOT NULL
    )
);

CREATE TABLE "CommunicationPermission" (
    "id" TEXT NOT NULL,
    "contactPointId" TEXT NOT NULL,
    "channel" "CommunicationChannel" NOT NULL,
    "purpose" "CommunicationPurpose" NOT NULL,
    "jurisdictionCountry" TEXT NOT NULL,
    "status" "CommunicationPermissionStatus" NOT NULL,
    "dataProcessingBasis" "DataProcessingBasis" NOT NULL,
    "communicationRule" "CommunicationRule" NOT NULL,
    "recipientCategory" "RecipientCategory" NOT NULL,
    "consentReference" TEXT,
    "evidenceUrl" TEXT,
    "policyVersion" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "reviewedBy" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunicationPermission_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CommunicationPermission_country_code_shape" CHECK ("jurisdictionCountry" ~ '^[A-Z]{2}$'),
    CONSTRAINT "CommunicationPermission_allowed_receipt" CHECK (
      "status" <> 'ALLOWED' OR (
        "dataProcessingBasis" <> 'UNKNOWN' AND
        "communicationRule" <> 'UNKNOWN' AND
        "evidenceUrl" IS NOT NULL
      )
    ),
    CONSTRAINT "CommunicationPermission_consent_reference" CHECK (
      "communicationRule" <> 'EXPLICIT_CONSENT' OR "consentReference" IS NOT NULL
    ),
    CONSTRAINT "CommunicationPermission_decision_evidence" CHECK (
      "status" = 'DENIED' OR "evidenceUrl" IS NOT NULL
    ),
    CONSTRAINT "CommunicationPermission_b2b_recipient" CHECK (
      "communicationRule" <> 'B2B_RECIPIENT_EXCEPTION' OR "recipientCategory" = 'TRADER_OR_CRAFTSMAN'
    ),
    CONSTRAINT "CommunicationPermission_b2b_jurisdiction" CHECK (
      "communicationRule" <> 'B2B_RECIPIENT_EXCEPTION' OR "jurisdictionCountry" = 'TR'
    ),
    CONSTRAINT "CommunicationPermission_expiry_order" CHECK (
      "expiresAt" IS NULL OR "expiresAt" > "checkedAt"
    )
);

CREATE TABLE "SuppressionEntry" (
    "id" TEXT NOT NULL,
    "channel" "CommunicationChannel" NOT NULL,
    "recipientHash" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "recordedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuppressionEntry_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SuppressionEntry_hash_shape" CHECK ("recipientHash" ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX "ContactPoint_companyId_type_normalizedValue_key" ON "ContactPoint"("companyId", "type", "normalizedValue");
CREATE INDEX "ContactPoint_companyId_idx" ON "ContactPoint"("companyId");
CREATE INDEX "ContactPoint_contactId_idx" ON "ContactPoint"("contactId");
CREATE INDEX "ContactPoint_verificationStatus_idx" ON "ContactPoint"("verificationStatus");
CREATE INDEX "ContactPoint_retentionUntil_idx" ON "ContactPoint"("retentionUntil");
CREATE INDEX "CommunicationPermission_contactPointId_channel_purpose_jurisdictionCountry_idx" ON "CommunicationPermission"("contactPointId", "channel", "purpose", "jurisdictionCountry");
CREATE INDEX "CommunicationPermission_status_idx" ON "CommunicationPermission"("status");
CREATE INDEX "CommunicationPermission_checkedAt_idx" ON "CommunicationPermission"("checkedAt");
CREATE UNIQUE INDEX "SuppressionEntry_channel_recipientHash_key" ON "SuppressionEntry"("channel", "recipientHash");
CREATE INDEX "SuppressionEntry_createdAt_idx" ON "SuppressionEntry"("createdAt");

ALTER TABLE "ContactPoint"
  ADD CONSTRAINT "ContactPoint_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ContactPoint"
  ADD CONSTRAINT "ContactPoint_contactId_companyId_fkey"
  FOREIGN KEY ("contactId", "companyId") REFERENCES "Contact"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CommunicationPermission"
  ADD CONSTRAINT "CommunicationPermission_contactPointId_fkey"
  FOREIGN KEY ("contactPointId") REFERENCES "ContactPoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
