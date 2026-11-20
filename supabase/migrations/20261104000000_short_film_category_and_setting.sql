-- AlterTable
ALTER TABLE "media" ADD COLUMN "category" TEXT;

-- AlterTable
ALTER TABLE "site_setting" ADD COLUMN "shortFilmCutoffMinutes" INTEGER NOT NULL DEFAULT 40;
