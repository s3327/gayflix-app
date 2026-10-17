-- Continue Watching: how far each title got, and titles taken off the row.
ALTER TABLE "watch_history" ADD COLUMN "progressSeconds" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "durationSeconds" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "hiddenFromContinue" BOOLEAN NOT NULL DEFAULT false;
