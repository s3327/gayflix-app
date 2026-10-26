-- CreateTable
CREATE TABLE "notification_setting" (
    "userId" TEXT NOT NULL,
    "newEpisodes" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_setting_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "notification_setting" ADD CONSTRAINT "notification_setting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: when each episode was added (existing ones get today).
ALTER TABLE "episode" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "episode_createdAt_idx" ON "episode"("createdAt");
