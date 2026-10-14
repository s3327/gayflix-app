-- AlterTable
ALTER TABLE "media" ADD COLUMN "backdropFocus" TEXT;
ALTER TABLE "media" ADD COLUMN "lockedFields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "report" ADD COLUMN "resolvedByUserId" TEXT;
ALTER TABLE "report" ADD COLUMN "notes" TEXT;

