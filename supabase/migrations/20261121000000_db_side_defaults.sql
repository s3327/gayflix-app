-- Let the database generate ids and updatedAt, so writes that don't go
-- through Prisma (Kysely) get them too. Prisma still sends its own values.
-- Ids stay text; a UUID is 36 characters, an old cuid 25.

ALTER TABLE "episode_redirect" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "video_source" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "subtitle" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "media_list" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "review" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "content_report" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "report" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "activity_log" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "title_revision" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "scheduled_job_run" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;

-- "updatedAt" is TIMESTAMP(3) without time zone and holds UTC, so the
-- trigger writes UTC whatever the session's TimeZone is.
CREATE FUNCTION public.set_updated_at() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW."updatedAt" = (now() AT TIME ZONE 'UTC');
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
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
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
