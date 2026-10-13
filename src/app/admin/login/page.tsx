import { redirect } from "next/navigation";
import { adminAccess } from "@/lib/admin-access";
import { safeAdminNextPath } from "@/lib/safe-redirect";
import { getSession } from "@/lib/session";
import AdminLoginForm from "./AdminLoginForm";

/**
 * Admin sign-in page.
 *
 * If an admin is already signed in (access === "ok"), they are sent straight
 * to ?next or /admin/dashboard (F33).
 */
export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await getSession();
  const access = adminAccess(session);
  const { next } = await searchParams;

  if (access === "ok") {
    redirect(safeAdminNextPath(next));
  }

  return <AdminLoginForm nextUrl={next} />;
}
