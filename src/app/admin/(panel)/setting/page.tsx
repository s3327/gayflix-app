import type { Metadata } from "next";
import SettingsTabs from "@/components/admin/SettingsTabs";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function SettingPage() {
  await requireAdmin();

  return (
    <div className="pb-10">
      <div className="px-6 pt-10 sm:px-10">
        <h1 className="font-display text-2xl font-bold">Settings</h1>
      </div>

      <div className="mt-6">
        <SettingsTabs />
      </div>
    </div>
  );
}
