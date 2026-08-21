-- DropIndex
DROP INDEX "Company_domain_key";

-- CreateIndex
CREATE INDEX "Company_domain_idx" ON "Company"("domain");
