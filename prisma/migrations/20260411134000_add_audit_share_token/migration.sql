-- AlterTable
ALTER TABLE "Audit" ADD COLUMN "shareToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Audit_shareToken_key" ON "Audit"("shareToken");
