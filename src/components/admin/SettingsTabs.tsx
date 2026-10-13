"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { newBadgeConfig } from "@/lib/new-badge-config";

type TabKey = "general" | "site" | "user" | "ads";

const TABS: { key: TabKey; label: string; description: string }[] = [
  {
    key: "general",
    label: "General",
    description:
      "Site name, default timezone, default language, and maintenance mode go here.",
  },
  {
    key: "site",
    label: "Site",
    description:
      "Branding (logo/favicon), theme colors, SEO/meta defaults, and the Trending page's time range (This Week / This Month) go here — plus the New Releases badge setting below.",
  },
  {
    key: "user",
    label: "User",
    description:
      "Registration rules, roles & permissions, and account defaults go here.",
  },
  {
    key: "ads",
    label: "Ads",
    description: "Ad network configuration and placement settings go here.",
  },
];

const PERIOD_OPTIONS = [
  { days: 3, label: "Last 3 days" },
  { days: 7, label: "Last 7 days" },
  { days: 14, label: "Last 14 days" },
  { days: 30, label: "Last month" },
];

/**
 * UI-only — tab switching is real (local state). Most tabs still just
 * name what will eventually live there, but Site now has one real
 * control group (the New Releases "NEW" badge) as a concrete example of
 * what a settings form looks like — the rest are still placeholders.
 *
 * The toggle/dropdown below control their own local state, seeded from
 * new-badge-config.ts's current values, but don't write back to that
 * file — there's no persistence layer yet. The public New Releases page
 * reads new-badge-config.ts directly, so changing these controls here
 * doesn't actually affect it. Once real settings storage exists, both
 * sides read from the same source instead of just sharing a default.
 */
export default function SettingsTabs() {
  const [active, setActive] = useState<TabKey>("general");
  const activeTab = TABS.find((t) => t.key === active)!;

  const [badgeEnabled] = useState(newBadgeConfig.enabled);
  const [periodDays] = useState(newBadgeConfig.periodDays);

  return (
    <div>
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
        className="px-6 py-8 sm:px-10"
      >
        <h2 className="font-display text-lg font-semibold">
          {activeTab.label}
        </h2>
        <p className="mt-2 max-w-lg text-sm text-ink-muted">
          {activeTab.description}
        </p>

        {active === "site" && (
          <div className="mt-6 max-w-md rounded-card border border-border-subtle p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-semibold">
                New Releases — &quot;NEW&quot; badge
              </h3>
              <span className="rounded-full bg-bg-elevated px-2 py-0.5 text-xs text-ink-muted">
                Read-only
              </span>
            </div>

            <div className="mt-4 flex items-center justify-between gap-4 opacity-60">
              <label
                htmlFor="new-badge-toggle"
                className="text-sm text-ink-secondary"
              >
                Show NEW badge on New Releases page
              </label>
              <button
                id="new-badge-toggle"
                type="button"
                role="switch"
                disabled
                aria-checked={badgeEnabled}
                className={`relative h-6 w-11 shrink-0 cursor-not-allowed rounded-full transition-colors ${
                  badgeEnabled ? "bg-brand-pink" : "bg-bg-elevated"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                    badgeEnabled ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>

            <div className="mt-5 opacity-60">
              <label
                htmlFor="new-badge-period"
                className="block text-sm text-ink-secondary"
              >
                Period
              </label>
              <div className="relative mt-1.5">
                <select
                  id="new-badge-period"
                  value={periodDays}
                  disabled
                  className="w-full cursor-not-allowed appearance-none rounded-md border border-border-subtle bg-bg-elevated py-2.5 pl-4 pr-10 text-sm text-ink-primary transition-colors focus:border-brand-pink focus-visible:outline-hidden"
                >
                  {PERIOD_OPTIONS.map((opt) => (
                    <option key={opt.days} value={opt.days}>
                      {opt.label}
                      {opt.days === 7 ? " (default)" : ""}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
              </div>
            </div>

            <p className="mt-4 rounded-md border border-border-subtle bg-bg-elevated p-3 text-xs text-ink-muted">
              Persistent settings storage in the database is planned for Phase 4.
              The live site currently reads defaults from the code (enabled, last 7 days).
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
