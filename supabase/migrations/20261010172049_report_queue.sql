-- AlterTable
ALTER TABLE "report" ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ADD COLUMN     "resolvedBy" TEXT;

-- CreateIndex
CREATE INDEX "report_resolvedAt_createdAt_idx" ON "report"("resolvedAt", "createdAt");
