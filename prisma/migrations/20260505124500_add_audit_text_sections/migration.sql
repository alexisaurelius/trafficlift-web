-- AlterTable: add three text-block fields used by the manual upload flow.
-- Each field stores the human-authored markdown for one category of findings
-- (on-page, technical & performance, authority). They replace the per-check
-- JSON upload while keeping the legacy AuditCheck table intact for old audits.
ALTER TABLE "Audit" ADD COLUMN "onPageContent" TEXT;
ALTER TABLE "Audit" ADD COLUMN "techPerfContent" TEXT;
ALTER TABLE "Audit" ADD COLUMN "authorityContent" TEXT;
