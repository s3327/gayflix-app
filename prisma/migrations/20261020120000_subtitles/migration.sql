-- CreateTable
CREATE TABLE "subtitle" (
    "id" TEXT NOT NULL,
    "mediaId" TEXT,
    "episodeId" TEXT,
    "language" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subtitle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subtitle_mediaId_language_key" ON "subtitle"("mediaId", "language");

-- CreateIndex
CREATE UNIQUE INDEX "subtitle_episodeId_language_key" ON "subtitle"("episodeId", "language");

-- AddForeignKey
ALTER TABLE "subtitle" ADD CONSTRAINT "subtitle_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subtitle" ADD CONSTRAINT "subtitle_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Subtitles belong to a movie or to an episode, never both or neither.
ALTER TABLE "subtitle" ADD CONSTRAINT "subtitle_one_owner" CHECK (("mediaId" IS NULL) <> ("episodeId" IS NULL));
