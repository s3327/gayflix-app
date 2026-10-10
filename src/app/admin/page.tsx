import { redirect } from "next/navigation";
import { getSession, isAdmin } from "@/lib/session";

export default async function AdminRootPage() {
  redirect(isAdmin(await getSession()) ? "/admin/dashboard" : "/admin/login");
}
