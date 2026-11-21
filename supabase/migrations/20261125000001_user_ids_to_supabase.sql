-- Accounts move from Better Auth ("user") to Supabase Auth (auth.users).
--
-- scripts/move-accounts-to-supabase.mjs runs first: it creates a Supabase
-- account for every "user" row and records the pair in account_move. This
-- migration then rewrites every column holding a user id through
-- account_move, makes it a uuid, points it at auth.users and drops Better
-- Auth's tables.
--
-- Deleting an account (auth.users) deletes the member's own data. Reports
-- of broken videos (report."userId") and audit columns (who resolved a
-- report, who did something in the activity log or a title revision)
-- keep their rows with the id cleared, so the audit trail survives; the
-- actor's email stays in its own column.
--
-- A database with no Better Auth accounts (a fresh one, CI's) needs no
-- script run.

-- The script's table (scripts/move-accounts-core.mjs), in case it never ran.
CREATE TABLE IF NOT EXISTS public.account_move (
  old_id text PRIMARY KEY,
  new_id uuid NOT NULL UNIQUE,
  role text NOT NULL DEFAULT 'user',
  "banReason" text,
  "movedAt" timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.account_move ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public."user" u
     WHERE NOT EXISTS (SELECT 1 FROM public.account_move m WHERE m.old_id = u.id)
  ) THEN
    RAISE EXCEPTION 'Run scripts/move-accounts-to-supabase.mjs first';
  END IF;
END;
$$;

-- Each moved account keeps its role and ban reason. The script may have
-- run before profile existed (20261122000000_supabase_auth.sql gives
-- every existing Auth account a profile).
INSERT INTO public.profile (id, role, "banReason")
SELECT m.new_id, m.role, left(m."banReason", 200)
  FROM public.account_move m
  JOIN auth.users u ON u.id = m.new_id
ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, "banReason" = EXCLUDED."banReason";

-- The foreign keys to "user" go first, since the new ids aren't in it.
ALTER TABLE public.favorite DROP CONSTRAINT "favorite_userId_fkey";
ALTER TABLE public.watchlist_item DROP CONSTRAINT "watchlist_item_userId_fkey";
ALTER TABLE public.watch_history DROP CONSTRAINT "watch_history_userId_fkey";
ALTER TABLE public.media_rating DROP CONSTRAINT "media_rating_userId_fkey";
ALTER TABLE public.media_list DROP CONSTRAINT "media_list_userId_fkey";
ALTER TABLE public.member_profile DROP CONSTRAINT "member_profile_userId_fkey";
ALTER TABLE public.review DROP CONSTRAINT "review_userId_fkey";
ALTER TABLE public.content_report DROP CONSTRAINT "content_report_userId_fkey";
ALTER TABLE public.report DROP CONSTRAINT "report_userId_fkey";

-- Rewriting the id isn't an edit: keep "updatedAt" as it is.
ALTER TABLE public.media_list DISABLE TRIGGER set_updated_at;
ALTER TABLE public.member_profile DISABLE TRIGGER set_updated_at;
ALTER TABLE public.review DISABLE TRIGGER set_updated_at;

DO $$
DECLARE
  col record;
  -- An id that is a uuid of an existing Supabase account. CASE, so the
  -- cast only sees values shaped like a uuid.
  known_template text := 'CASE WHEN t.%1$I ~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'' '
    'THEN EXISTS (SELECT 1 FROM auth.users u WHERE u.id = t.%1$I::uuid) ELSE false END';
  known text;
BEGIN
  FOR col IN
    SELECT * FROM (VALUES
      ('favorite', 'userId', true),
      ('watchlist_item', 'userId', true),
      ('watch_history', 'userId', true),
      ('media_rating', 'userId', true),
      ('media_list', 'userId', true),
      ('member_profile', 'userId', true),
      ('review', 'userId', true),
      ('content_report', 'userId', true),
      ('report', 'userId', false),
      ('report', 'resolvedByUserId', false),
      ('activity_log', 'actorId', false),
      ('title_revision', 'actorId', false)
    ) AS c(tbl, name, required)
  LOOP
    known := format(known_template, col.name);
    EXECUTE format(
      'UPDATE public.%1$I t SET %2$I = m.new_id::text FROM public.account_move m WHERE t.%2$I = m.old_id',
      col.tbl, col.name
    );
    -- What's left points at no account (one deleted since the move, or
    -- before it where no foreign key kept the column in step).
    IF col.required THEN
      EXECUTE format('DELETE FROM public.%I t WHERE NOT (%s)', col.tbl, known);
    ELSE
      EXECUTE format('UPDATE public.%1$I t SET %2$I = NULL WHERE %2$I IS NOT NULL AND NOT (%3$s)',
        col.tbl, col.name, known);
    END IF;
    EXECUTE format('ALTER TABLE public.%1$I ALTER COLUMN %2$I TYPE uuid USING %2$I::uuid', col.tbl, col.name);
  END LOOP;
END;
$$;

ALTER TABLE public.media_list ENABLE TRIGGER set_updated_at;
ALTER TABLE public.member_profile ENABLE TRIGGER set_updated_at;
ALTER TABLE public.review ENABLE TRIGGER set_updated_at;

ALTER TABLE public.favorite ADD CONSTRAINT "favorite_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.watchlist_item ADD CONSTRAINT "watchlist_item_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.watch_history ADD CONSTRAINT "watch_history_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.media_rating ADD CONSTRAINT "media_rating_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.media_list ADD CONSTRAINT "media_list_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.member_profile ADD CONSTRAINT "member_profile_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.review ADD CONSTRAINT "review_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.content_report ADD CONSTRAINT "content_report_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.report ADD CONSTRAINT "report_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.report ADD CONSTRAINT "report_resolvedByUserId_fkey"
  FOREIGN KEY ("resolvedByUserId") REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.activity_log ADD CONSTRAINT "activity_log_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.title_revision ADD CONSTRAINT "title_revision_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES auth.users(id) ON DELETE SET NULL;

-- Better Auth's tables. Two-factor secrets don't carry over: members turn
-- two-factor on again (docs/SUPABASE_CUTOVER.md).
DROP TABLE public."twoFactor";
DROP TABLE public.session;
DROP TABLE public.account;
DROP TABLE public.verification;
DROP TABLE public."rateLimit";
DROP TABLE public."user";
DROP TABLE public.account_move;
