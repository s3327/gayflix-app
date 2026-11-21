import AccountProfile from "@/components/AccountProfile";
import { linkedSignInMethods } from "@/lib/account-actions";
import { accountCreatedAt } from "@/lib/auth-profile";
import { requireUser } from "@/lib/session";

const MEMBER_SINCE = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

/**
 * /account: the profile (name, email, password). The session token
 * carries the name and email; whether the account has a password (it
 * may sign in with Google only) and when it was made are read here.
 */
export default async function AccountPage() {
  const session = await requireUser("/account");
  const [methods, createdAt] = await Promise.all([
    linkedSignInMethods(),
    accountCreatedAt(session.user.id),
  ]);
  return (
    <AccountProfile
      hasPassword={methods.includes("email")}
      memberSince={createdAt ? MEMBER_SINCE.format(createdAt) : ""}
    />
  );
}
