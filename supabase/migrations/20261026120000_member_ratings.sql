-- CreateEnum
CREATE TYPE "rating_value" AS ENUM ('not_for_me', 'like', 'love');

-- CreateTable
CREATE TABLE "media_rating" (
    "userId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "value" "rating_value" NOT NULL,
    "ratedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_rating_pkey" PRIMARY KEY ("userId","mediaId")
);

-- CreateIndex
CREATE INDEX "media_rating_mediaId_value_idx" ON "media_rating"("mediaId", "value");

-- AddForeignKey
ALTER TABLE "media_rating" ADD CONSTRAINT "media_rating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_rating" ADD CONSTRAINT "media_rating_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media"("id") ON DELETE CASCADE ON UPDATE CASCADE;
