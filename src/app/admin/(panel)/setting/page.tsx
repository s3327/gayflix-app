import SettingsTabs from "@/components/admin/SettingsTabs";

export default function SettingPage() {
  return (
    <div className="pb-10">
      <div className="px-6 pt-10 sm:px-10">
        <h1 className="font-display text-2xl font-bold">Setting</h1>
      </div>

      <div className="mt-6">
        <SettingsTabs />
      </div>
    </div>
  );
}
