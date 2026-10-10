import { redirect } from "next/navigation";

// Admins reset their password the same way as everyone else: admin
// accounts are regular accounts with the "admin" role.
export default function AdminForgotPasswordPage() {
  redirect("/forgot-password");
}
