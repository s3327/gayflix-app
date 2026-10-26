-- CreateTable
CREATE TABLE "collection" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "published" BOOLEAN NOT NULL DEFAULT false,
    "onHome" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "startsAt" DATE,
    "endsAt" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_item" (
    "collectionId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collection_item_pkey" PRIMARY KEY ("collectionId","mediaId")
);

-- CreateIndex
CREATE INDEX "collection_published_position_idx" ON "collection"("published", "position");

-- CreateIndex
CREATE INDEX "collection_item_collectionId_position_idx" ON "collection_item"("collectionId", "position");

-- CreateIndex
CREATE INDEX "collection_item_mediaId_idx" ON "collection_item"("mediaId");

-- AddForeignKey
ALTER TABLE "collection_item" ADD CONSTRAINT "collection_item_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_item" ADD CONSTRAINT "collection_item_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media"("id") ON DELETE CASCADE ON UPDATE CASCADE;
