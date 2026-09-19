-- PR-BC1 (BC1 + BC6) — money value contract.
--
-- BUSINESS CORRECTNESS
-- 1) GROSS_PROFIT is a signed economic fact: a shipment can lose money, so a
--    negative gross profit must be representable. Until now a blanket
--    non-negative CHECK made a real loss impossible to record.
-- 2) Every other outcome type stays non-negative: those values are magnitudes
--    (counts/amounts), not profit or loss.
-- 3) GROSS_PROFIT must always carry valueMinor + currency: an unvalued gross
--    profit is not a finance receipt.
-- 4) Opportunity.estimatedValue is an estimate: never negative, and when a value
--    exists it must carry a canonical 3-letter currency.
-- 5) "Unknown gross profit" is recorded as *no outcome row*, never as zero:
--    UNKNOWN is not ZERO (0 is a real, measured value).
--
-- FORWARD-ONLY: one CHECK is replaced and three are added. No data is modified
-- and every existing row already satisfies the new contract, because the old
-- constraint guaranteed "valueMinor" >= 0.
ALTER TABLE "RecommendationOutcome"
  DROP CONSTRAINT "RecommendationOutcome_value_nonnegative";

ALTER TABLE "RecommendationOutcome"
  ADD CONSTRAINT "RecommendationOutcome_value_by_type" CHECK (
    "valueMinor" IS NULL
    OR (
      "outcomeType" = 'GROSS_PROFIT'::"RecommendationOutcomeType"
      AND "valueMinor" BETWEEN -2000000000 AND 2000000000
    )
    OR (
      "outcomeType" <> 'GROSS_PROFIT'::"RecommendationOutcomeType"
      AND "valueMinor" BETWEEN 0 AND 2000000000
    )
  );

ALTER TABLE "RecommendationOutcome"
  ADD CONSTRAINT "RecommendationOutcome_gross_profit_value_required" CHECK (
    "outcomeType" <> 'GROSS_PROFIT'::"RecommendationOutcomeType"
    OR ("valueMinor" IS NOT NULL AND "currency" IS NOT NULL)
  );

ALTER TABLE "Opportunity"
  ADD CONSTRAINT "Opportunity_estimated_value_nonnegative" CHECK (
    "estimatedValue" IS NULL OR "estimatedValue" >= 0
  );

ALTER TABLE "Opportunity"
  ADD CONSTRAINT "Opportunity_estimated_value_currency_shape" CHECK (
    "estimatedValue" IS NULL OR ("currency" IS NOT NULL AND "currency" ~ '^[A-Z]{3}$')
  );
