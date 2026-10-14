/*
 * The rules behind the admin Users page (/admin/users): who may be made
 * an admin, banned or signed out, and how a ban form is read. Kept free
 * of server imports so the rules are unit-tested; the server functions
 * in src/lib/admin-user-actions.ts apply them.
 */

/** Better Auth's user ids: 32 letters and digits. */
const USER_ID = /^[A-Za-z0-9]{16,64}$/;

export function isUserId(value: unknown): value is string {
  return typeof value === "string" && USER_ID.test(value);
}

export const USER_FILTERS = ["all", "admins", "banned", "unconfirmed"] as const;
export type UserFilter = (typeof USER_FILTERS)[number];

/** `?show=` on /admin/users, falling back to everyone. */
export function userFilterParam(value: string | undefined): UserFilter {
  return USER_FILTERS.find((filter) => filter === value) ?? "all";
}

/** What the rules need to know about the account being changed. */
export type UserTarget = {
  id: string;
  role: string | null;
  emailVerified: boolean;
  banned: boolean | null;
  banExpires: Date | null;
};

export function isAdmin(user: Pick<UserTarget, "role">): boolean {
  return user.role === "admin";
}

/**
 * Banned right now. A ban with an end date stays in the database after
 * it ends, until the account next signs in (Better Auth clears it then).
 */
export function isBanned(user: Pick<UserTarget, "banned" | "banExpires">, now = Date.now()): boolean {
  return Boolean(user.banned) && (!user.banExpires || user.banExpires.getTime() > now);
}

export type UserAction = "make-admin" | "remove-admin" | "ban" | "unban" | "sign-out";

export function isOwner(user: Pick<UserTarget, "role">): boolean {
  return user.role === "owner";
}

export function isStaff(user: Pick<UserTarget, "role">): boolean {
  return user.role === "admin" || user.role === "owner" || user.role === "editor" || user.role === "moderator";
}

/**
 * Why an admin (`actorId`) can't do `action` to `user`, or null if they
 * can. The page only offers allowed actions; the server functions check
 * again.
 *
 * Nobody changes their own account here, so the panel always keeps at
 * least one admin and nobody locks themselves out.
 */
export function userActionProblem(
  action: UserAction,
  actorId: string,
  user: UserTarget,
  now = Date.now()
): string | null {
  if (user.id === actorId) return "You can't change your own account here.";
  if (isOwner(user)) return "The site owner cannot be demoted, banned or changed.";
  const banned = isBanned(user, now);
  switch (action) {
    case "make-admin":
      if (isAdmin(user)) return "This account is already an admin.";
      if (!user.emailVerified) {
        return "This account hasn't confirmed its email yet, so it can't sign in.";
      }
      if (banned) return "Unban this account first.";
      return null;
    case "remove-admin":
      return isAdmin(user) ? null : "This account isn't an admin.";
    case "ban":
      return isAdmin(user) ? "Remove this account's admin access before banning it." : null;
    case "unban":
      return banned ? null : "This account isn't banned.";
    case "sign-out":
      return null;
  }
}

export const BAN_REASON_MAX = 200;

/** How long a ban lasts, as the ban form offers it. */
export const BAN_LENGTHS = [
  { value: "forever", label: "Until unbanned", seconds: undefined },
  { value: "1d", label: "1 day", seconds: 24 * 60 * 60 },
  { value: "7d", label: "7 days", seconds: 7 * 24 * 60 * 60 },
  { value: "30d", label: "30 days", seconds: 30 * 24 * 60 * 60 },
] as const;

/**
 * The ban form's reason and length, or null if either isn't one the form
 * could have sent. An empty reason is allowed.
 */
export function parseBanForm(form: FormData): { reason: string; seconds: number | undefined } | null {
  const reason = form.get("reason") ?? "";
  const length = BAN_LENGTHS.find((option) => option.value === form.get("length"));
  if (typeof reason !== "string" || !length) return null;
  const trimmed = reason.trim();
  if (trimmed.length > BAN_REASON_MAX) return null;
  return { reason: trimmed, seconds: length.seconds };
}
