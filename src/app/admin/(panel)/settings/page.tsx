import type { Metadata } from "next";
import SettingsTabs from "@/components/admin/SettingsTabs";
import { getSiteSettings } from "@/lib/site-settings";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  await requireAdmin();
  const settings = await getSiteSettings();

  return (
    <div className="pb-10">
      <div className="px-6 pt-10 sm:px-10">
        <h1 className="font-display text-2xl font-bold">Settings</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Manage system-wide configuration, access control, and platform defaults.
        </p>
      </div>

      <div className="mt-6">
        <SettingsTabs
          key={settings.updatedAt ? new Date(settings.updatedAt).toISOString() : "settings"}
          initialSettings={settings}
        />
      </div>
    </div>
  );
}
