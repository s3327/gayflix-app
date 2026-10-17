import { getSiteSettings } from "@/lib/site-settings";

// The page names itself in the tab; this adds the closed-registration notice.
export default async function Layout({ children }: { children: React.ReactNode }) {
  const settings = await getSiteSettings();

  return (
    <div>
      {!settings.registrationOpen && (
        <div
          role="status"
          aria-live="polite"
          className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-center text-xs font-medium text-amber-300"
        >
          Public registration is currently closed. New account creations are temporarily disabled.
        </div>
      )}
      {children}
    </div>
  );
}
