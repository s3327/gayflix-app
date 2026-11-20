-- AlterTable
ALTER TABLE "media" ADD COLUMN     "imdbId" TEXT,
ADD COLUMN     "tmdbId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "media_tmdbId_key" ON "media"("tmdbId");

-- CreateIndex
CREATE UNIQUE INDEX "media_imdbId_key" ON "media"("imdbId");

