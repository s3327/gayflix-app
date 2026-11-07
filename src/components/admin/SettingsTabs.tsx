"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Save, Check, AlertCircle, Shield, Sparkles, Wand2, RefreshCw } from "lucide-react";
import type { SiteSettingsData } from "@/lib/site-settings";
import {
  updateSiteSettingsAction,
  backfillCleanSynopsesAction,
  backfillShortFilmCategoriesAction,
} from "@/lib/admin-setting-actions";

type TabKey = "general" | "access" | "maintenance";

const TABS: { key: TabKey; label: string; description: string }[] = [
  {
    key: "general",
    label: "General",
    description: "Site title, tagline, support contact, and notification webhooks.",
  },
  {
    key: "access",
    label: "Access & Features",
    description: "Maintenance mode, public registration, and VIP / donation controls.",
  },
  {
    key: "maintenance",
    label: "Maintenance & Tools",
    description: "Data cleanup tools, WordPress import sanitization, and category backfill routines.",
  },
];

export default function SettingsTabs({
  initialSettings,
}: {
  initialSettings: SiteSettingsData;
}) {
  const router = useRouter();
  const [active, setActive] = useState<TabKey>("general");
  const [isPending, startTransition] = useTransition();
  const [statusMessage, setStatusMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // Form states
  const [siteTitle, setSiteTitle] = useState(initialSettings.siteTitle);
  const [tagline, setTagline] = useState(initialSettings.tagline);
  const [contactEmail, setContactEmail] = useState(initialSettings.contactEmail ?? "");
  const [defaultPageSize, setDefaultPageSize] = useState(String(initialSettings.defaultPageSize));
  const [shortFilmCutoffMinutes, setShortFilmCutoffMinutes] = useState(String(initialSettings.shortFilmCutoffMinutes ?? 40));
  const [webhookUrl, setWebhookUrl] = useState(initialSettings.webhookUrl ?? "");
  const [maintenanceMode, setMaintenanceMode] = useState(initialSettings.maintenanceMode);
  const [registrationOpen, setRegistrationOpen] = useState(initialSettings.registrationOpen);
  const [donationEnabled, setDonationEnabled] = useState(initialSettings.donationEnabled ?? false);

  // Maintenance tools state
  const [cleaningSynopses, setCleaningSynopses] = useState(false);
  const [cleaningStatus, setCleaningStatus] = useState<string | null>(null);
  const [backfillingCategories, setBackfillingCategories] = useState(false);
  const [backfillStatus, setBackfillStatus] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatusMessage(null);

    const form = e.currentTarget;
    const maintenanceInput = form.querySelector<HTMLInputElement>("#maintenanceMode");
    const registrationInput = form.querySelector<HTMLInputElement>("#registrationOpen");
    const donationInput = form.querySelector<HTMLInputElement>("#donationEnabled");
    const currentMaintenanceMode = maintenanceInput ? maintenanceInput.checked : maintenanceMode;
    const currentRegistrationOpen = registrationInput ? registrationInput.checked : registrationOpen;
    const currentDonationEnabled = donationInput ? donationInput.checked : donationEnabled;

    setMaintenanceMode(currentMaintenanceMode);
    setRegistrationOpen(currentRegistrationOpen);
    setDonationEnabled(currentDonationEnabled);

    const payload = {
      siteTitle,
      tagline,
      contactEmail,
      defaultPageSize: Number(defaultPageSize),
      shortFilmCutoffMinutes: Number(shortFilmCutoffMinutes),
      webhookUrl,
      maintenanceMode: currentMaintenanceMode,
      registrationOpen: currentRegistrationOpen,
      donationEnabled: currentDonationEnabled,
    };

    startTransition(async () => {
      const res = await updateSiteSettingsAction(payload);
      if (res.ok) {
        setStatusMessage({ ok: true, text: res.message || "Settings saved successfully." });
        router.refresh();
      } else {
        setStatusMessage({ ok: false, text: res.message || "Failed to save settings." });
      }
    });
  };

  const handleCleanSynopses = async () => {
    setCleaningSynopses(true);
    setCleaningStatus(null);
    try {
      const res = await backfillCleanSynopsesAction();
      if (res.ok) {
        setCleaningStatus(
          `Success: Cleaned ${res.mediaUpdated} movie(s) and ${res.episodesUpdated} episode(s).`
        );
        router.refresh();
      } else {
        setCleaningStatus(`Failed: ${res.message}`);
      }
    } catch (err) {
      setCleaningStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setCleaningSynopses(false);
    }
  };

  const handleBackfillCategories = async () => {
    setBackfillingCategories(true);
    setBackfillStatus(null);
    try {
      const res = await backfillShortFilmCategoriesAction(Number(shortFilmCutoffMinutes));
      if (res.ok) {
        setBackfillStatus(
          `Success: Assigned "Short Film" category to ${res.updated} title(s) (runtime ≤ ${res.threshold} min).`
        );
        router.refresh();
      } else {
        setBackfillStatus(`Failed: ${res.message}`);
      }
    } catch (err) {
      setBackfillStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBackfillingCategories(false);
    }
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
            onClick={() => {
              setActive(tab.key);
              setStatusMessage(null);
            }}
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
            {statusMessage.ok ? <Check className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {active === "maintenance" ? (
          <div className="mt-6 space-y-6">
            <div className="rounded-card border border-border-subtle bg-bg-surface p-5">
              <div className="flex items-start gap-3">
                <Wand2 className="mt-1 h-5 w-5 text-ink-brand shrink-0" />
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-ink-primary">
                    Sanitize WordPress HTML Synopses
                  </h3>
                  <p className="mt-1 text-xs text-ink-muted leading-relaxed">
                    Scans all movie, series, and episode descriptions in the database to remove legacy WordPress HTML artifacts
                    (such as <code className="rounded bg-bg-elevated px-1 py-0.5 font-mono text-xs text-ink-secondary">&lt;p&gt;</code>,{" "}
                    <code className="rounded bg-bg-elevated px-1 py-0.5 font-mono text-xs text-ink-secondary">&lt;strong&gt;</code>,{" "}
                    <code className="rounded bg-bg-elevated px-1 py-0.5 font-mono text-xs text-ink-secondary">&lt;!-- wp:... --&gt;</code> comments, and HTML entities like{" "}
                    <code className="rounded bg-bg-elevated px-1 py-0.5 font-mono text-xs text-ink-secondary">&amp;nbsp;</code> and <code className="rounded bg-bg-elevated px-1 py-0.5 font-mono text-xs text-ink-secondary">&amp;amp;</code>).
                    Converts them to clean, formatted plain text.
                  </p>
                  <div className="mt-4 flex items-center gap-3">
                    <button
                      type="button"
                      disabled={cleaningSynopses}
                      onClick={handleCleanSynopses}
                      className="inline-flex items-center gap-2 rounded-card bg-brand-pink px-4 py-2 text-xs font-bold text-ink-onBrand hover:bg-brand-pink-light disabled:opacity-50 transition-colors cursor-pointer"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${cleaningSynopses ? "animate-spin" : ""}`} />
                      {cleaningSynopses ? "Cleaning Synopses..." : "Clean All Synopses Now"}
                    </button>
                    {cleaningStatus && (
                      <span className="text-xs text-ink-primary font-mono">{cleaningStatus}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-card border border-border-subtle bg-bg-surface p-5">
              <div className="flex items-start gap-3">
                <Sparkles className="mt-1 h-5 w-5 text-ink-brand shrink-0" />
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-ink-primary">
                    Backfill Short Film Categories
                  </h3>
                  <p className="mt-1 text-xs text-ink-muted leading-relaxed">
                    Retroactively scans all movies in the catalog and assigns the “Short Film” category taxonomy
                    to any movie whose runtime is less than or equal to the configured cutoff ({shortFilmCutoffMinutes} minutes).
                  </p>
                  <div className="mt-4 flex items-center gap-3">
                    <button
                      type="button"
                      disabled={backfillingCategories}
                      onClick={handleBackfillCategories}
                      className="inline-flex items-center gap-2 rounded-card bg-bg-elevated border border-border-strong px-4 py-2 text-xs font-bold text-ink-primary hover:bg-bg-surface disabled:opacity-50 transition-colors cursor-pointer"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${backfillingCategories ? "animate-spin" : ""}`} />
                      {backfillingCategories ? "Applying Categories..." : "Run Category Backfill"}
                    </button>
                    {backfillStatus && (
                      <span className="text-xs text-ink-primary font-mono">{backfillStatus}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-6">
            {active === "general" && (
              <div className="space-y-4">
                <div>
                  <label htmlFor="siteTitle" className="block text-xs font-semibold uppercase text-ink-secondary mb-1">
                    Site Title
                  </label>
                  <input
                    id="siteTitle"
                    name="siteTitle"
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
                    name="tagline"
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
                    name="contactEmail"
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
                    name="defaultPageSize"
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
                  <label htmlFor="shortFilmCutoffMinutes" className="block text-xs font-semibold uppercase text-ink-secondary mb-1">
                    Short Film Runtime Cutoff (Minutes)
                  </label>
                  <input
                    id="shortFilmCutoffMinutes"
                    name="shortFilmCutoffMinutes"
                    type="number"
                    min="1"
                    max="300"
                    value={shortFilmCutoffMinutes}
                    onChange={(e) => setShortFilmCutoffMinutes(e.target.value)}
                    className="w-full rounded-md border border-border-subtle bg-bg-surface px-3 py-2 text-sm text-ink-primary focus:border-brand-pink focus:outline-hidden"
                  />
                  <p className="mt-1 text-xs text-ink-muted">
                    Imported movies with runtime less than or equal to this duration will automatically receive the “Short Film” category taxonomy.
                  </p>
                </div>

                <div>
                  <label htmlFor="webhookUrl" className="block text-xs font-semibold uppercase text-ink-secondary mb-1">
                    Activity Alert Webhook URL (Discord / Telegram / Slack)
                  </label>
                  <input
                    id="webhookUrl"
                    name="webhookUrl"
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
                    name="maintenanceMode"
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
                      maintenance screen (<code className="rounded bg-bg-elevated px-1 py-0.5 font-mono text-xs text-ink-secondary">/maintenance</code>). Staff accounts can still browse the full site with an alert banner.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-card border border-border-subtle bg-bg-surface p-4">
                  <input
                    id="registrationOpen"
                    name="registrationOpen"
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

                <div className="flex items-start gap-3 rounded-card border border-border-subtle bg-bg-surface p-4">
                  <input
                    id="donationEnabled"
                    name="donationEnabled"
                    type="checkbox"
                    checked={donationEnabled}
                    onChange={(e) => setDonationEnabled(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-border-strong accent-brand-pink"
                  />
                  <div>
                    <label htmlFor="donationEnabled" className="text-sm font-semibold text-ink-primary cursor-pointer">
                      Enable Donation (VIP)
                    </label>
                    <p className="text-xs text-ink-muted mt-0.5">
                      Turn on or off VIP supporter status and donation options across the platform.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-card border border-border-subtle bg-bg-surface p-4">
                  <Shield className="mt-1 h-5 w-5 text-ink-brand shrink-0" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-ink-primary">
                        Two-Factor Authentication (2FA)
                      </span>
                      <Link
                        href="/account/setting"
                        className="text-xs font-semibold text-ink-brand hover:underline"
                      >
                        Manage in Account Settings →
                      </Link>
                    </div>
                    <p className="text-xs text-ink-muted mt-0.5">
                      Two-factor sign-in is optional by default for all accounts. You can enable or disable 2FA for your account in{" "}
                      <Link href="/account/setting" className="text-ink-primary underline hover:text-brand-pink">
                        Account Settings
                      </Link>. To mandate 2FA across all staff members, set <code className="rounded bg-bg-elevated px-1 py-0.5 font-mono text-xs text-ink-primary">ADMIN_REQUIRE_2FA=true</code> in your environment variables.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="pt-4 border-t border-border-subtle flex justify-end">
              <button
                type="submit"
                disabled={isPending}
                className="flex items-center gap-2 rounded-card bg-brand-pink px-5 py-2 text-sm font-bold text-ink-onBrand hover:bg-brand-pink-light disabled:opacity-50 transition-colors cursor-pointer"
              >
                <Save className="h-4 w-4" />
                {isPending ? "Saving..." : "Save Settings"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
