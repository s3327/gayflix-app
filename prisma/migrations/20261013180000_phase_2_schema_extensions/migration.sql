-- AlterTable
ALTER TABLE "media" ADD COLUMN     "publishedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "episode" ADD COLUMN     "stillUrl" TEXT;

-- CreateTable
CREATE TABLE "episode_redirect" (
    "id" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "oldSlug" TEXT NOT NULL,
    "newSlug" TEXT NOT NULL,
    "oldSeasonNumber" INTEGER NOT NULL,
    "oldEpisodeNumber" INTEGER NOT NULL,
    "newSeasonNumber" INTEGER NOT NULL,
    "newEpisodeNumber" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "episode_redirect_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "episode_redirect_oldSlug_key" ON "episode_redirect"("oldSlug");

-- CreateIndex
CREATE INDEX "episode_redirect_mediaId_idx" ON "episode_redirect"("mediaId");

-- CreateIndex
CREATE INDEX "media_status_publishedAt_idx" ON "media"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "media_status_type_publishedAt_idx" ON "media"("status", "type", "publishedAt");

-- AddForeignKey
ALTER TABLE "episode_redirect" ADD CONSTRAINT "episode_redirect_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill existing published titles
UPDATE "media" SET "publishedAt" = "createdAt" WHERE "status" = 'published' AND "publishedAt" IS NULL;
