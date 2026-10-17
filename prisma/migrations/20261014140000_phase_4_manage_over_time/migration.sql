-- CreateTable
CREATE TABLE "activity_log" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorEmail" TEXT NOT NULL,
    "actorRole" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "summary" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_setting" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "siteTitle" TEXT NOT NULL DEFAULT 'Gayflix',
    "tagline" TEXT NOT NULL DEFAULT 'Stream queer cinema, series and shorts',
    "contactEmail" TEXT DEFAULT 'support@gayflix.com',
    "registrationOpen" BOOLEAN NOT NULL DEFAULT true,
    "maintenanceMode" BOOLEAN NOT NULL DEFAULT false,
    "allowedEmbedHosts" TEXT[] NOT NULL DEFAULT ARRAY['vidsrc.to', 'superembed.stream', '2embed.cc', 'multiembed.mov', 'autoembed.to', 'player.vidsrc.me']::TEXT[],
    "defaultPageSize" INTEGER NOT NULL DEFAULT 24,
    "webhookUrl" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,

    CONSTRAINT "site_setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "title_revision" (
    "id" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "actorId" TEXT,
    "actorEmail" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "title_revision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_job_run" (
    "id" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "itemsCount" INTEGER NOT NULL DEFAULT 0,
    "details" TEXT,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "triggeredBy" TEXT NOT NULL DEFAULT 'scheduler',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "scheduled_job_run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "activity_log_createdAt_idx" ON "activity_log"("createdAt");
CREATE INDEX "activity_log_entityType_entityId_idx" ON "activity_log"("entityType", "entityId");
CREATE INDEX "activity_log_actorId_idx" ON "activity_log"("actorId");

-- CreateIndex
CREATE INDEX "title_revision_mediaId_createdAt_idx" ON "title_revision"("mediaId", "createdAt");

-- CreateIndex
CREATE INDEX "scheduled_job_run_jobName_startedAt_idx" ON "scheduled_job_run"("jobName", "startedAt");

-- AddForeignKey
ALTER TABLE "title_revision" ADD CONSTRAINT "title_revision_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed default site_setting row
INSERT INTO "site_setting" ("id", "siteTitle", "tagline", "contactEmail", "registrationOpen", "maintenanceMode", "allowedEmbedHosts", "defaultPageSize", "updatedAt")
VALUES ('default', 'Gayflix', 'Stream queer cinema, series and shorts', 'support@gayflix.com', true, false, ARRAY['vidsrc.to', 'superembed.stream', '2embed.cc', 'multiembed.mov', 'autoembed.to', 'player.vidsrc.me']::TEXT[], 24, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
