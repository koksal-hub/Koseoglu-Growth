CREATE FUNCTION "enforce_outreach_draft_status_transition"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."status" IS DISTINCT FROM OLD."status" AND NOT (
    (OLD."status" = 'DRAFT' AND NEW."status" = 'IN_REVIEW') OR
    (OLD."status" = 'IN_REVIEW' AND NEW."status" IN ('APPROVED', 'REJECTED', 'EXPIRED'))
  ) THEN
    RAISE EXCEPTION 'invalid outreach draft status transition: % -> %', OLD."status", NEW."status";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "OutreachDraft_status_transition_guard"
BEFORE UPDATE OF "status" ON "OutreachDraft"
FOR EACH ROW EXECUTE FUNCTION "enforce_outreach_draft_status_transition"();

CREATE FUNCTION "reject_outreach_receipt_update"()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION '% is append-only and cannot be updated', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "OutreachDraftRevision_append_only_guard"
BEFORE UPDATE ON "OutreachDraftRevision"
FOR EACH ROW EXECUTE FUNCTION "reject_outreach_receipt_update"();

CREATE TRIGGER "OutreachApproval_append_only_guard"
BEFORE UPDATE ON "OutreachApproval"
FOR EACH ROW EXECUTE FUNCTION "reject_outreach_receipt_update"();
