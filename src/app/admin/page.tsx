import { redirect } from "next/navigation";

export default function AdminRootPage() {
  // Once auth exists: check session here, redirect to /admin/dashboard if
  // logged in, /admin/login if not. For now there's only a login screen.
  redirect("/admin/login");
}
