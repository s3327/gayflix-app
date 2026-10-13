-- AlterTable
ALTER TABLE "media" ADD COLUMN "statusBeforeTrash" "media_status",
ADD COLUMN "featuredBeforeTrash" BOOLEAN DEFAULT false;

-- Clear any previously stored IP addresses and user agents from sessions
UPDATE "session" SET "ipAddress" = NULL, "userAgent" = NULL;

