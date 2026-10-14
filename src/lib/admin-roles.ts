export type AdminRole = "owner" | "admin" | "editor" | "moderator";
export type UserRole = AdminRole | "user";

export const ADMIN_ROLES: AdminRole[] = ["owner", "admin", "editor", "moderator"];

/** Whether a role string has access to the admin dashboard and panel. */
export function isStaffRole(role: string | null | undefined): role is AdminRole {
  return typeof role === "string" && ADMIN_ROLES.includes(role as AdminRole);
}

/** Whether the role can view and mutate catalog media (movies, series, episodes, sources, import). */
export function canManageCatalog(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin" || role === "editor";
}

/** Whether the role can view and moderate user accounts and reports. */
export function canManageUsers(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin" || role === "moderator";
}

/** Whether the role can view and modify global site settings. */
export function canManageSettings(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

/** Whether the role can trigger and monitor background maintenance jobs. */
export function canManageJobs(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

/** Whether the role is the site Owner. */
export function isOwner(role: string | null | undefined): boolean {
  return role === "owner";
}

/** Human-readable label for a role. */
export function roleLabel(role: string | null | undefined): string {
  switch (role) {
    case "owner":
      return "Owner";
    case "admin":
      return "Admin";
    case "editor":
      return "Editor";
    case "moderator":
      return "Moderator";
    default:
      return "Member";
  }
}

/** Role badge styling classes. */
export function roleBadgeClass(role: string | null | undefined): string {
  switch (role) {
    case "owner":
      return "bg-brand-pink/15 text-ink-brand border-brand-pink/30";
    case "admin":
      return "bg-purple-500/15 text-purple-400 border-purple-500/30";
    case "editor":
      return "bg-blue-500/15 text-blue-400 border-blue-500/30";
    case "moderator":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    default:
      return "bg-bg-elevated text-ink-muted border-border-subtle";
  }
}
