-- AlterTable
ALTER TABLE "media" ADD COLUMN "publishAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "media_publishAt_idx" ON "media"("publishAt");
