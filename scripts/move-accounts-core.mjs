// The work of scripts/move-accounts-to-supabase.mjs, apart from its
// connections, so it can be tested with stand-ins.

/** Highest first: a Better Auth role list keeps its strongest staff role. */
const STAFF_ROLES = ["owner", "admin", "editor", "moderator"];

/**
 * account_move: one row per Better Auth account already moved. The
 * migration 20261125000001_user_ids_to_supabase.sql creates the same
 * table if no move ran, and drops it when it's done.
 */
export const ACCOUNT_MOVE_TABLE = `
  CREATE TABLE IF NOT EXISTS public.account_move (
    old_id text PRIMARY KEY,
    new_id uuid NOT NULL UNIQUE,
    role text NOT NULL DEFAULT 'user',
    "banReason" text,
    "movedAt" timestamptz NOT NULL DEFAULT now()
  );
  ALTER TABLE public.account_move ENABLE ROW LEVEL SECURITY;
`;

/** "someone@example.com" → "s***@e***.com", for logs. */
export function maskEmail(email) {
  const [local = "", domain = ""] = String(email).split("@");
  const dot = domain.lastIndexOf(".");
  const host = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot) : "";
  return `${local.slice(0, 1)}***@${host.slice(0, 1)}***${tld}`;
}

/**
 * The site role (profile.role) for a Better Auth role. Better Auth's admin
 * plugin allows a comma-separated list; anything that isn't a staff role
 * is a member ("user").
 */
export function profileRole(role) {
  const roles = String(role ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase());
  return STAFF_ROLES.find((staff) => roles.includes(staff)) ?? "user";
}

/**
 * Auth's ban_duration for a Better Auth ban, or undefined when the account
 * isn't banned (or its ban has run out). A ban with no end lasts 100 years.
 */
export function banDuration(user, now = Date.now()) {
  if (!user.banned) return undefined;
  if (!user.banExpires) return "876000h";
  const hours = Math.ceil((new Date(user.banExpires).getTime() - now) / 3_600_000);
  return hours > 0 ? `${hours}h` : undefined;
}

function isEmailTaken(error) {
  return (
    error?.code === "email_exists" ||
    (error?.status === 422 && /already (been )?registered|already exists/i.test(String(error?.message)))
  );
}

/** Auth's account for `email` (any case), through the admin API's pages. */
async function findAuthUserByEmail(admin, email) {
  const wanted = email.toLowerCase();
  const perPage = 1000;
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.listUsers({ page, perPage });
    if (error) throw error;
    const found = data.users.find((user) => user.email?.toLowerCase() === wanted);
    if (found) return found;
    if (data.users.length < perPage) return null;
  }
}

/**
 * Gives every Better Auth account ("user") a Supabase Auth account, and
 * records the pair, the role and any ban reason in account_move. Accounts
 * already in account_move are skipped, so it can run again after a crash.
 * Passwords don't carry over (Better Auth's scrypt hashes can't be
 * imported): everyone sets a new one with "Forgot password".
 *
 * @param {object} options
 * @param {{ query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }> }} options.db
 *   a pg client on DIRECT_URL
 * @param {{ createUser: Function, listUsers: Function }} options.admin
 *   supabase.auth.admin with the secret key
 * @param {boolean} [options.dryRun] only print what would happen
 * @param {(line: string) => void} [options.log]
 * @param {number} [options.now] the time bans are measured from (ms)
 * @returns {Promise<{ moved: number, skipped: number, adopted: number, planned: number }>}
 */
export async function moveAccounts({ db, admin, dryRun = false, log = console.log, now = Date.now() }) {
  const hasMoveTable = (await db.query("SELECT to_regclass('public.account_move') AS t")).rows[0].t !== null;
  if (!dryRun && !hasMoveTable) await db.query(ACCOUNT_MOVE_TABLE);
  const hasProfile = (await db.query("SELECT to_regclass('public.profile') AS t")).rows[0].t !== null;

  const users = (
    await db.query(
      `SELECT id, name, email, "emailVerified", role, banned, "banReason", "banExpires"
         FROM public."user" ORDER BY "createdAt", id`
    )
  ).rows;
  const moved = new Set(
    hasMoveTable || !dryRun ? (await db.query("SELECT old_id FROM public.account_move")).rows.map((r) => r.old_id) : []
  );

  const result = { moved: 0, skipped: 0, adopted: 0, planned: 0 };
  for (const user of users) {
    const who = maskEmail(user.email);
    if (moved.has(user.id)) {
      result.skipped += 1;
      log(`skip ${who}: already moved`);
      continue;
    }
    const role = profileRole(user.role);
    const ban = banDuration(user, now);
    const banReason = ban ? (user.banReason ?? null) : null;
    const summary = `role ${role}${user.emailVerified ? "" : ", email not confirmed"}${ban ? ", banned" : ""}`;
    if (dryRun) {
      result.planned += 1;
      log(`would move ${who} (${summary})`);
      continue;
    }

    let newId;
    const created = await admin.createUser({
      email: user.email,
      email_confirm: Boolean(user.emailVerified),
      user_metadata: { name: user.name },
      ...(ban ? { ban_duration: ban } : {}),
    });
    if (created.error) {
      if (!isEmailTaken(created.error)) {
        throw new Error(`Creating the account for ${who} failed: ${created.error.message}`);
      }
      // A run that stopped between creating the account and recording it.
      const existing = await findAuthUserByEmail(admin, user.email);
      if (!existing) throw new Error(`Auth says ${who} exists, but no account has that email`);
      const claimed = await db.query("SELECT old_id FROM public.account_move WHERE new_id = $1", [existing.id]);
      if (claimed.rows.length > 0) {
        throw new Error(`The Auth account for ${who} is already recorded for another account`);
      }
      newId = existing.id;
      result.adopted += 1;
      log(`found ${who} in Auth from an earlier run; recording it`);
    } else {
      newId = created.data.user.id;
    }

    await db.query("BEGIN");
    try {
      await db.query(
        `INSERT INTO public.account_move (old_id, new_id, role, "banReason") VALUES ($1, $2, $3, $4)`,
        [user.id, newId, role, banReason]
      );
      // Before the Supabase Auth migrations there's no profile table; the
      // migration then copies the role from account_move.
      if (hasProfile) {
        await db.query(`UPDATE public.profile SET role = $1 WHERE id = $2`, [role, newId]);
      }
      await db.query("COMMIT");
    } catch (error) {
      await db.query("ROLLBACK").catch(() => {});
      throw error;
    }
    result.moved += 1;
    log(`moved ${who} (${summary})`);
  }
  return result;
}
