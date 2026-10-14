"use client";

import { useState, useTransition } from "react";
import { Save, Check, AlertCircle } from "lucide-react";
import type { SiteSettingsData } from "@/lib/site-settings";
import { updateSiteSettingsAction } from "@/lib/admin-setting-actions";

type TabKey = "general" | "access" | "playback";

const TABS: { key: TabKey; label: string; description: string }[] = [
  {
    key: "general",
    label: "General",
    description: "Site title, tagline, support contact, and notification webhooks.",
  },
  {
    key: "access",
    label: "Access & Maintenance",
    description: "Maintenance mode and public account registration controls.",
  },
  {
    key: "playback",
    label: "Playback & Embeds",
    description: "Whitelisted embed provider hosts and stream player defaults.",
  },
];

export default function SettingsTabs({
  initialSettings,
}: {
  initialSettings: SiteSettingsData;
}) {
  const [active, setActive] = useState<TabKey>("general");
  const [isPending, startTransition] = useTransition();
  const [statusMessage, setStatusMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // Form states
  const [siteTitle, setSiteTitle] = useState(initialSettings.siteTitle);
  const [tagline, setTagline] = useState(initialSettings.tagline);
  const [contactEmail, setContactEmail] = useState(initialSettings.contactEmail ?? "");
  const [defaultPageSize, setDefaultPageSize] = useState(String(initialSettings.defaultPageSize));
  const [webhookUrl, setWebhookUrl] = useState(initialSettings.webhookUrl ?? "");
  const [maintenanceMode, setMaintenanceMode] = useState(initialSettings.maintenanceMode);
  const [registrationOpen, setRegistrationOpen] = useState(initialSettings.registrationOpen);
  const [allowedEmbedHosts, setAllowedEmbedHosts] = useState(initialSettings.allowedEmbedHosts.join("\n"));

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatusMessage(null);

    const formData = new FormData();
    formData.set("siteTitle", siteTitle);
    formData.set("tagline", tagline);
    formData.set("contactEmail", contactEmail);
    formData.set("defaultPageSize", defaultPageSize);
    formData.set("webhookUrl", webhookUrl);
    formData.set("maintenanceMode", String(maintenanceMode));
    formData.set("registrationOpen", String(registrationOpen));
    formData.set("allowedEmbedHosts", allowedEmbedHosts);

    startTransition(async () => {
      const res = await updateSiteSettingsAction(formData);
      if (res.ok) {
        setStatusMessage({ ok: true, text: res.message || "Settings saved successfully." });
      } else {
        setStatusMessage({ ok: false, text: res.message || "Failed to save settings." });
      }
    });
  };

  const activeTab = TABS.find((t) => t.key === active)!;

  return (
    <div>
      {/* Tab Navigation */}
      <div
        role="tablist"
        aria-label="Settings sections"
        className="flex gap-1 overflow-x-auto border-b border-border-subtle px-6 scrollbar-none sm:px-10"
      >
        {TABS.map((tab) => (
          <button
            key={tab.key}
            id={`tab-${tab.key}`}
            role="tab"
            aria-selected={active === tab.key}
            aria-controls={`panel-${tab.key}`}
            type="button"
            onClick={() => setActive(tab.key)}
            className={`shrink-0 border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
              active === tab.key
                ? "border-brand-pink text-ink-brand"
                : "border-transparent text-ink-secondary hover:text-ink-primary"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        id={`panel-${activeTab.key}`}
        role="tabpanel"
        aria-labelledby={`tab-${activeTab.key}`}
        className="px-6 py-8 sm:px-10 max-w-3xl"
      >
        <h2 className="font-display text-lg font-semibold">{activeTab.label}</h2>
        <p className="mt-1 text-sm text-ink-muted">{activeTab.description}</p>

        {statusMessage && (
          <div
            role="status"
            className={`mt-4 flex items-center gap-2 rounded-card p-3 text-sm border ${
              statusMessage.ok
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                : "bg-status-error/10 text-status-error border-status-error/30"
            }`}
          >
            {statusMessage.ok ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            <span>{statusMessage.text}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-6">
          {active === "general" && (
            <div className="space-y-4">
              <div>
                <label htmlFor="siteTitle" className="block text-xs font-semibold uppercase text-ink-secondary mb-1">
                  Site Title
                </label>
                <input
                  id="siteTitle"
                  type="text"
                  required
                  value={siteTitle}
                  onChange={(e) => setSiteTitle(e.target.value)}
                  className="w-full rounded-md border border-border-subtle bg-bg-surface px-3 py-2 text-sm text-ink-primary focus:border-brand-pink focus:outline-hidden"
                />
              </div>

              <div>
                <label htmlFor="tagline" className="block text-xs font-semibold uppercase text-ink-secondary mb-1">
                  Site Tagline
                </label>
                <input
                  id="tagline"
                  type="text"
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  className="w-full rounded-md border border-border-subtle bg-bg-surface px-3 py-2 text-sm text-ink-primary focus:border-brand-pink focus:outline-hidden"
                />
              </div>

              <div>
                <label htmlFor="contactEmail" className="block text-xs font-semibold uppercase text-ink-secondary mb-1">
                  Support Contact Email
                </label>
                <input
                  id="contactEmail"
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="e.g. support@gayflix.com"
                  className="w-full rounded-md border border-border-subtle bg-bg-surface px-3 py-2 text-sm text-ink-primary focus:border-brand-pink focus:outline-hidden"
                />
              </div>

              <div>
                <label htmlFor="defaultPageSize" className="block text-xs font-semibold uppercase text-ink-secondary mb-1">
                  Default Browse / Catalog Page Size
                </label>
                <select
                  id="defaultPageSize"
                  value={defaultPageSize}
                  onChange={(e) => setDefaultPageSize(e.target.value)}
                  className="w-full rounded-md border border-border-subtle bg-bg-surface px-3 py-2 text-sm text-ink-primary focus:border-brand-pink focus:outline-hidden"
                >
                  <option value="12">12 items</option>
                  <option value="24">24 items (Default)</option>
                  <option value="48">48 items</option>
                  <option value="96">96 items</option>
                </select>
              </div>

              <div>
                <label htmlFor="webhookUrl" className="block text-xs font-semibold uppercase text-ink-secondary mb-1">
                  Activity Alert Webhook URL (Discord / Telegram / Slack)
                </label>
                <input
                  id="webhookUrl"
                  type="url"
                  placeholder="https://discord.com/api/webhooks/..."
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  className="w-full rounded-md border border-border-subtle bg-bg-surface px-3 py-2 text-sm text-ink-primary focus:border-brand-pink focus:outline-hidden font-mono text-xs"
                />
                <p className="mt-1 text-xs text-ink-muted">
                  Receives asynchronous JSON POST payloads when admin events (title edits, bans) occur.
                </p>
              </div>
            </div>
          )}

          {active === "access" && (
            <div className="space-y-6">
              <div className="flex items-start gap-3 rounded-card border border-border-subtle bg-bg-surface p-4">
                <input
                  id="maintenanceMode"
                  type="checkbox"
                  checked={maintenanceMode}
                  onChange={(e) => setMaintenanceMode(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-border-strong accent-brand-pink"
                />
                <div>
                  <label htmlFor="maintenanceMode" className="text-sm font-semibold text-ink-primary cursor-pointer">
                    Enable Maintenance Mode
                  </label>
                  <p className="text-xs text-ink-muted mt-0.5">
                    When enabled, unauthenticated visitors and regular members are redirected to the friendly
                    maintenance screen (`/maintenance`). Staff accounts can still browse the full site with an alert banner.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-card border border-border-subtle bg-bg-surface p-4">
                <input
                  id="registrationOpen"
                  type="checkbox"
                  checked={registrationOpen}
                  onChange={(e) => setRegistrationOpen(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-border-strong accent-brand-pink"
                />
                <div>
                  <label htmlFor="registrationOpen" className="text-sm font-semibold text-ink-primary cursor-pointer">
                    Allow Public User Sign-Ups
                  </label>
                  <p className="text-xs text-ink-muted mt-0.5">
                    Allow new visitors to register accounts. When unchecked, the sign-up page shows registrations are currently closed.
                  </p>
                </div>
              </div>
            </div>
          )}

          {active === "playback" && (
            <div className="space-y-4">
              <div>
                <label htmlFor="allowedEmbedHosts" className="block text-xs font-semibold uppercase text-ink-secondary mb-1">
                  Allowed Video Embed Hosts (One per line)
                </label>
                <textarea
                  id="allowedEmbedHosts"
                  rows={6}
                  value={allowedEmbedHosts}
                  onChange={(e) => setAllowedEmbedHosts(e.target.value)}
                  className="w-full rounded-md border border-border-subtle bg-bg-surface px-3 py-2 text-sm text-ink-primary focus:border-brand-pink focus:outline-hidden font-mono text-xs"
                />
                <p className="mt-1 text-xs text-ink-muted">
                  The Content-Security-Policy iframe whitelist is generated dynamically from these host domains.
                </p>
              </div>
            </div>
          )}

          <div className="pt-4 border-t border-border-subtle flex justify-end">
            <button
              type="submit"
              disabled={isPending}
              className="flex items-center gap-2 rounded-card bg-brand-pink px-5 py-2 text-sm font-bold text-ink-onBrand hover:bg-brand-pink-light disabled:opacity-50 transition-colors"
            >
              <Save className="h-4 w-4" />
              {isPending ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
