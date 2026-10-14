import Badge from "@/components/Badge";
import { isBanned, type UserTarget } from "@/lib/user-admin";

/** An account's role and state at a glance: Owner, Admin, Editor, Moderator, Banned, Email not confirmed. */
export default function UserBadges({ user }: { user: Omit<UserTarget, "id"> }) {
  const banned = isBanned(user);
  const role = user.role ?? "user";
  const isStaff = ["owner", "admin", "editor", "moderator"].includes(role);
  if (!isStaff && !banned && user.emailVerified) return null;
  return (
    <span className="flex shrink-0 flex-wrap gap-2">
      {role === "owner" && <Badge tone="brand">Owner</Badge>}
      {role === "admin" && <Badge tone="brand">Admin</Badge>}
      {role === "editor" && <Badge tone="neutral">Editor</Badge>}
      {role === "moderator" && <Badge tone="neutral">Moderator</Badge>}
      {banned && <Badge tone="danger">Banned</Badge>}
      {!user.emailVerified && <Badge>Email not confirmed</Badge>}
    </span>
  );
}
