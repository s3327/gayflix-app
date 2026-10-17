-- Lists are private until their owner shares them, existing ones included.
ALTER TABLE "media_list" ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT false;
