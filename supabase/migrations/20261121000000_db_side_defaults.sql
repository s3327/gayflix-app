-- Let the database generate ids and updatedAt, so writes that don't go
-- through Prisma (Kysely) get them too. Prisma still sends its own values.
-- Ids stay text: a UUID without hyphens, 32 lowercase hex characters, which
-- the id checks in src/lib (/^[a-z0-9]{20,40}$/) accept.

ALTER TABLE "episode_redirect" ALTER COLUMN "id" SET DEFAULT replace(gen_random_uuid()::text, '-', '');
ALTER TABLE "video_source" ALTER COLUMN "id" SET DEFAULT replace(gen_random_uuid()::text, '-', '');
ALTER TABLE "subtitle" ALTER COLUMN "id" SET DEFAULT replace(gen_random_uuid()::text, '-', '');
ALTER TABLE "media_list" ALTER COLUMN "id" SET DEFAULT replace(gen_random_uuid()::text, '-', '');
ALTER TABLE "review" ALTER COLUMN "id" SET DEFAULT replace(gen_random_uuid()::text, '-', '');
ALTER TABLE "content_report" ALTER COLUMN "id" SET DEFAULT replace(gen_random_uuid()::text, '-', '');
ALTER TABLE "report" ALTER COLUMN "id" SET DEFAULT replace(gen_random_uuid()::text, '-', '');
ALTER TABLE "activity_log" ALTER COLUMN "id" SET DEFAULT replace(gen_random_uuid()::text, '-', '');
ALTER TABLE "title_revision" ALTER COLUMN "id" SET DEFAULT replace(gen_random_uuid()::text, '-', '');
ALTER TABLE "scheduled_job_run" ALTER COLUMN "id" SET DEFAULT replace(gen_random_uuid()::text, '-', '');

-- "updatedAt" is TIMESTAMP(3) without time zone and holds UTC, so the
-- trigger writes UTC whatever the session's TimeZone is.
--   1. A statement that sets "updatedAt" itself keeps its value.
--   2. An update that changes nothing but the columns named in the
--      trigger's arguments leaves it alone (view counts and the featured
--      flag must not reorder /movie and /series, which sort by it).
--   3. Any other update sets it to now (UTC).
CREATE FUNCTION public.set_updated_at() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  ignored text;
  before jsonb := to_jsonb(OLD) - 'updatedAt';
  after jsonb := to_jsonb(NEW) - 'updatedAt';
BEGIN
  IF NEW."updatedAt" IS DISTINCT FROM OLD."updatedAt" THEN
    RETURN NEW;
  END IF;
  FOREACH ignored IN ARRAY TG_ARGV LOOP
    before := before - ignored;
    after := after - ignored;
  END LOOP;
  IF before IS DISTINCT FROM after THEN
    NEW."updatedAt" = (now() AT TIME ZONE 'UTC');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON "user"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "session"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "account"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "verification"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "media"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at('viewCount', 'featured');
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "collection"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "video_source"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "media_list"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "member_profile"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "review"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON "site_setting"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Inserts that omit "updatedAt" (Kysely) get now in UTC; Prisma sends its own.
ALTER TABLE "user" ALTER COLUMN "updatedAt" SET DEFAULT (now() AT TIME ZONE 'UTC');
ALTER TABLE "session" ALTER COLUMN "updatedAt" SET DEFAULT (now() AT TIME ZONE 'UTC');
ALTER TABLE "account" ALTER COLUMN "updatedAt" SET DEFAULT (now() AT TIME ZONE 'UTC');
ALTER TABLE "verification" ALTER COLUMN "updatedAt" SET DEFAULT (now() AT TIME ZONE 'UTC');
ALTER TABLE "media" ALTER COLUMN "updatedAt" SET DEFAULT (now() AT TIME ZONE 'UTC');
ALTER TABLE "collection" ALTER COLUMN "updatedAt" SET DEFAULT (now() AT TIME ZONE 'UTC');
ALTER TABLE "video_source" ALTER COLUMN "updatedAt" SET DEFAULT (now() AT TIME ZONE 'UTC');
ALTER TABLE "media_list" ALTER COLUMN "updatedAt" SET DEFAULT (now() AT TIME ZONE 'UTC');
ALTER TABLE "member_profile" ALTER COLUMN "updatedAt" SET DEFAULT (now() AT TIME ZONE 'UTC');
ALTER TABLE "review" ALTER COLUMN "updatedAt" SET DEFAULT (now() AT TIME ZONE 'UTC');
ALTER TABLE "site_setting" ALTER COLUMN "updatedAt" SET DEFAULT (now() AT TIME ZONE 'UTC');
