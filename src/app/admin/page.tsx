import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/session";

export default async function AdminRootPage() {
  await requireAdmin();
  redirect("/admin/dashboard");
}
