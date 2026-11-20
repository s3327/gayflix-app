-- Attempt counters for the site's own limits on signing in and checking
-- emailed codes (src/lib/auth-rate-limit.ts). Every Auth call now comes
-- from the site's server, so Supabase's per-IP limits see the host's
-- addresses, not the visitor's. One row per limited key: the key is a
-- keyed hash (of the client IP and/or the email), never the raw values.
CREATE TABLE public.auth_rate_limit (
  key text PRIMARY KEY,
  count integer NOT NULL,
  "windowStart" timestamptz NOT NULL
);

CREATE INDEX auth_rate_limit_window_start_idx ON public.auth_rate_limit ("windowStart");

ALTER TABLE public.auth_rate_limit ENABLE ROW LEVEL SECURITY;
