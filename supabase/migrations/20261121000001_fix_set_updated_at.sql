-- With no trigger arguments TG_ARGV is NULL, not an empty array, and
-- FOREACH over NULL raises an error. Only loop when there are arguments.
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger
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
  IF TG_NARGS > 0 THEN
    FOREACH ignored IN ARRAY TG_ARGV LOOP
      before := before - ignored;
      after := after - ignored;
    END LOOP;
  END IF;
  IF before IS DISTINCT FROM after THEN
    NEW."updatedAt" = (now() AT TIME ZONE 'UTC');
  END IF;
  RETURN NEW;
END;
$$;
