import type { Metadata } from "next";
import { redirect } from "next/navigation";
import SettingsTabs from "@/components/admin/SettingsTabs";
import { readSiteSettings } from "@/lib/site-settings";
import { requireAdmin } from "@/lib/session";
import { canManageSettings } from "@/lib/admin-roles";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  const session = await requireAdmin();
  if (!canManageSettings(session.user.role)) {
    redirect("/admin");
  }
  // Not the fail-safe fallback: a form filled with it would save over the real settings.
  const settings = await readSiteSettings();

  return (
    <div className="pb-10">
      <div className="px-6 pt-10 sm:px-10">
        <h1 className="font-display text-2xl font-bold">Settings</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Manage system-wide configuration, access control, and platform defaults.
        </p>
      </div>

      <div className="mt-6">
        <SettingsTabs initialSettings={settings} />
      </div>
    </div>
  );
}
