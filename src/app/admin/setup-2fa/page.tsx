import { redirect } from "next/navigation";
import { adminAccess } from "@/lib/admin-access";
import { getSession } from "@/lib/session";
import SetupTwoFactor from "./SetupTwoFactor";

/**
 * Where requireAdmin() sends an admin who hasn't turned on two-factor
 * yet. Admins can't open the panel until they finish here.
 */
export default async function SetupTwoFactorPage() {
  const access = adminAccess(await getSession());
  if (access === "not-admin") redirect("/admin/login");
  if (access !== "setup-2fa") redirect("/admin/dashboard");
  return <SetupTwoFactor />;
}
