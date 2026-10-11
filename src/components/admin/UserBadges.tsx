import Badge from "@/components/Badge";
import { isAdmin, isBanned, type UserTarget } from "@/lib/user-admin";

/** An account's role and state at a glance: Admin, Banned, Email not confirmed. */
export default function UserBadges({ user }: { user: Omit<UserTarget, "id"> }) {
  const banned = isBanned(user);
  if (!isAdmin(user) && !banned && user.emailVerified) return null;
  return (
    <span className="flex shrink-0 flex-wrap gap-2">
      {isAdmin(user) && <Badge tone="brand">Admin</Badge>}
      {banned && <Badge tone="danger">Banned</Badge>}
      {!user.emailVerified && <Badge>Email not confirmed</Badge>}
    </span>
  );
}
