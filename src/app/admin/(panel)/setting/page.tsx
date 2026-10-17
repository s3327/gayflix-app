import { redirect } from "next/navigation";

export default function SettingPageRedirect() {
  redirect("/admin/settings");
}
