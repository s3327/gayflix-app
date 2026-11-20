-- AlterTable
ALTER TABLE "media_list" ADD COLUMN     "communityBlocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "inCommunity" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "member_profile" (
    "userId" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "nicknameKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_profile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "review" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "hiddenAt" TIMESTAMP(3),
    "hiddenBy" TEXT,

    CONSTRAINT "review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_report" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT,
    "listId" TEXT,
    "userId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,

    CONSTRAINT "content_report_pkey" PRIMARY KEY ("id"),
    -- A report is about a review or a list, never both or neither.
    CONSTRAINT "content_report_one_target" CHECK (num_nonnulls("reviewId", "listId") = 1)
);

-- CreateIndex
CREATE UNIQUE INDEX "member_profile_nicknameKey_key" ON "member_profile"("nicknameKey");

-- CreateIndex
CREATE INDEX "review_mediaId_hiddenAt_createdAt_idx" ON "review"("mediaId", "hiddenAt", "createdAt");

-- CreateIndex
CREATE INDEX "review_createdAt_idx" ON "review"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "review_userId_mediaId_key" ON "review"("userId", "mediaId");

-- CreateIndex
CREATE INDEX "content_report_resolvedAt_createdAt_idx" ON "content_report"("resolvedAt", "createdAt");

-- CreateIndex
CREATE INDEX "content_report_userId_createdAt_idx" ON "content_report"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "content_report_reviewId_userId_key" ON "content_report"("reviewId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "content_report_listId_userId_key" ON "content_report"("listId", "userId");

-- CreateIndex
CREATE INDEX "media_list_inCommunity_updatedAt_idx" ON "media_list"("inCommunity", "updatedAt");

-- AddForeignKey
ALTER TABLE "member_profile" ADD CONSTRAINT "member_profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review" ADD CONSTRAINT "review_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review" ADD CONSTRAINT "review_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_report" ADD CONSTRAINT "content_report_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_report" ADD CONSTRAINT "content_report_listId_fkey" FOREIGN KEY ("listId") REFERENCES "media_list"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_report" ADD CONSTRAINT "content_report_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
