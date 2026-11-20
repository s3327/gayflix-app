-- CreateTable
CREATE TABLE "watchlist_item" (
    "userId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "entry" JSONB NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "watchlist_item_pkey" PRIMARY KEY ("userId","mediaId")
);

-- AddForeignKey
ALTER TABLE "watchlist_item" ADD CONSTRAINT "watchlist_item_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
