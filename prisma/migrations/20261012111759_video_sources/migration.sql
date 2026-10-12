-- CreateEnum
CREATE TYPE "video_source_kind" AS ENUM ('embed', 'hls', 'file');

-- CreateTable
CREATE TABLE "video_source" (
    "id" TEXT NOT NULL,
    "mediaId" TEXT,
    "episodeId" TEXT,
    "label" TEXT NOT NULL,
    "kind" "video_source_kind" NOT NULL,
    "url" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_source_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "video_source_mediaId_position_idx" ON "video_source"("mediaId", "position");

-- CreateIndex
CREATE INDEX "video_source_episodeId_position_idx" ON "video_source"("episodeId", "position");

-- AddForeignKey
ALTER TABLE "video_source" ADD CONSTRAINT "video_source_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_source" ADD CONSTRAINT "video_source_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A source belongs to a movie or to an episode, never both or neither.
ALTER TABLE "video_source" ADD CONSTRAINT "video_source_one_owner" CHECK (("mediaId" IS NULL) <> ("episodeId" IS NULL));
