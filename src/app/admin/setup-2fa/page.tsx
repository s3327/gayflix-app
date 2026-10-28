import { redirect } from "next/navigation";
import { adminAccess } from "@/lib/admin-access";
import { getSession } from "@/lib/session";
import SetupTwoFactor from "./SetupTwoFactor";

/**
 * Where requireAdmin() sends an admin who hasn't turned on two-factor
 * yet (when 2FA is required), or where staff can optionally enroll in 2FA.
 */
export default async function SetupTwoFactorPage() {
  const session = await getSession();
  const access = adminAccess(session);
  if (access === "not-admin") redirect("/admin/login");
  if (session?.user.twoFactorEnabled) redirect("/admin/dashboard");
  return <SetupTwoFactor />;
}
