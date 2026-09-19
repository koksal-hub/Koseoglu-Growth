-- BC2/BC3 — identity scope: a domain is evidence, a tax number is jurisdictional.
--
-- 1) BC2: a domain is a web property, not a legal entity. Holdings, group
--    companies and sibling legal entities legitimately share one domain, so a
--    global unique index made correct data impossible to store and pushed the
--    system towards treating a website as an identity. It is replaced by a plain
--    lookup index; deterministic entity resolution keeps using the domain as
--    strong *evidence*, and a match remains a proposal for a human decision
--    (LINK_MATCH), never an automatic merge.
--
-- 2) BC3: a tax/registration number identifies a company only together with its
--    jurisdiction - the same digits can exist in different countries. The global
--    unique index is replaced by a scoped partial unique index that applies only
--    when BOTH country and taxNumber are present. A row whose country is unknown
--    is deliberately NOT protected by a constraint; entity resolution refuses to
--    treat it as a hard (confidence 1) identity instead.
--
-- FORWARD-ONLY: two unique indexes are replaced by (one plain, one scoped
-- unique) index. No data is modified. Run the duplicate pre-flight check below
-- before applying to a database that already contains company data; fresh and
-- upgrade replays are covered by the migration convergence gate.
--
-- Pre-flight (expects 0 rows):
--   SELECT "country", "taxNumber", count(*)
--     FROM "Company"
--    WHERE "country" IS NOT NULL AND "taxNumber" IS NOT NULL
--    GROUP BY 1, 2 HAVING count(*) > 1;
DROP INDEX "Company_domain_key";

CREATE INDEX "Company_domain_idx" ON "Company"("domain");

DROP INDEX "Company_taxNumber_key";

CREATE UNIQUE INDEX "Company_country_taxNumber_key"
  ON "Company"("country", "taxNumber")
  WHERE "taxNumber" IS NOT NULL AND "country" IS NOT NULL;
