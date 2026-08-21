-- Additive-only migration: CHECK constraints backing application-layer
-- invariants (defense in depth). No DROP/DELETE/TRUNCATE.

-- Every Activity must reference at least one of a Lead or a Contact
-- (application layer: createActivity in apps/api/src/lib/activity.ts).
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_lead_or_contact_required"
  CHECK ("leadId" IS NOT NULL OR "contactId" IS NOT NULL);

-- Confidence values are defined as 0..1 (ADR-008 Confidence Gate).
ALTER TABLE "Company" ADD CONSTRAINT "Company_confidence_range"
  CHECK ("confidence" >= 0 AND "confidence" <= 1);

ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_confidence_range"
  CHECK ("confidence" >= 0 AND "confidence" <= 1);
