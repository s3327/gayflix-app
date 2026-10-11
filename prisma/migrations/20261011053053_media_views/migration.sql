-- DropIndex
DROP INDEX "media_status_viewCount_idx";

-- CreateTable
CREATE TABLE "media_view" (
    "mediaId" TEXT NOT NULL,
    "viewer" TEXT NOT NULL,
    "day" DATE NOT NULL,

    CONSTRAINT "media_view_pkey" PRIMARY KEY ("mediaId","viewer","day")
);

-- CreateIndex
CREATE INDEX "media_view_day_mediaId_idx" ON "media_view"("day", "mediaId");

-- AddForeignKey
ALTER TABLE "media_view" ADD CONSTRAINT "media_view_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Views are counted from now on. The sample catalog's view counts were
-- made up, so every title starts at zero.
UPDATE "media" SET "viewCount" = 0;
