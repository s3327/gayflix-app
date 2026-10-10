-- CreateEnum
CREATE TYPE "media_type" AS ENUM ('movie', 'series');

-- CreateEnum
CREATE TYPE "media_status" AS ENUM ('draft', 'published');

-- CreateTable
CREATE TABLE "media" (
    "id" TEXT NOT NULL,
    "type" "media_type" NOT NULL,
    "status" "media_status" NOT NULL DEFAULT 'draft',
    "title" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "duration" TEXT NOT NULL,
    "genres" TEXT[],
    "country" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "synopsis" TEXT NOT NULL DEFAULT '',
    "tagline" TEXT,
    "rating" DOUBLE PRECISION,
    "director" TEXT,
    "creator" TEXT,
    "cast" TEXT[],
    "tags" TEXT[],
    "releaseDate" DATE,
    "runtimeMinutes" INTEGER,
    "posterUrl" TEXT NOT NULL,
    "backdropUrl" TEXT,
    "gradient" TEXT,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "episode" (
    "id" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "seasonNumber" INTEGER NOT NULL,
    "episodeNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "duration" TEXT NOT NULL,
    "airDate" DATE,

    CONSTRAINT "episode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "media_status_type_updatedAt_idx" ON "media"("status", "type", "updatedAt");

-- CreateIndex
CREATE INDEX "media_status_createdAt_idx" ON "media"("status", "createdAt");

-- CreateIndex
CREATE INDEX "media_status_viewCount_idx" ON "media"("status", "viewCount");

-- CreateIndex
CREATE UNIQUE INDEX "episode_mediaId_seasonNumber_episodeNumber_key" ON "episode"("mediaId", "seasonNumber", "episodeNumber");

-- AddForeignKey
ALTER TABLE "episode" ADD CONSTRAINT "episode_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media"("id") ON DELETE CASCADE ON UPDATE CASCADE;
