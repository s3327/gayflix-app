import { redirect } from "next/navigation";
import { adminAccess } from "@/lib/admin-access";
import { getVerifiedSession } from "@/lib/session";
import SetupTwoFactor from "./SetupTwoFactor";

/**
 * Where requireAdmin() sends staff without two-factor when it's required
 * (ADMIN_REQUIRE_2FA), and where staff can turn it on when it isn't.
 * Signed-out visitors, members, and sign-ins still waiting for their
 * code (getVerifiedSession() is null for those) go to the admin login;
 * staff who already have two-factor go to the dashboard.
 */
export default async function SetupTwoFactorPage() {
  const session = await getVerifiedSession();
  const access = adminAccess(session);
  if (access === "not-admin") redirect("/admin/login");
  if (session?.hasVerifiedTotp) redirect("/admin/dashboard");
  const required = process.env.ADMIN_REQUIRE_2FA === "true" || process.env.ADMIN_REQUIRE_2FA === "1";
  return <SetupTwoFactor required={required} />;
}
