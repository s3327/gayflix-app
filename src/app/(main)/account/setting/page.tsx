import { headers } from "next/headers";
import { Monitor, Smartphone } from "lucide-react";
import DeleteAccount from "@/components/DeleteAccount";
import NicknameSetting from "@/components/NicknameSetting";
import TwoFactorSetting from "@/components/TwoFactorSetting";
import { signOutDevice, signOutOtherDevices } from "@/lib/account-actions";
import { accountDeletionProblem } from "@/lib/account-deletion";
import { isStaffRole } from "@/lib/admin-roles";
import { auth } from "@/lib/auth";
import { getMyNickname } from "@/lib/community";
import { deviceName, isMobileDevice } from "@/lib/device-name";
import { requireUser } from "@/lib/session";

const DATE = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const SECONDARY_BUTTON =
  "rounded-card border border-border-strong px-4 py-2 text-sm font-semibold text-ink-secondary transition-colors hover:bg-bg-elevated hover:text-ink-primary";

/**
 * Where the account is signed in, with a way to sign out of the other
 * devices, optional two-factor sign-in, the public nickname, downloading
 * the account's data, and deleting the account. Device names come from each
 * session's browser (src/lib/device-name.ts); addresses aren't shown.
 * "Last active" moves at most once a day, when the session is renewed.
 */
export default async function AccountSettingPage() {
  const session = await requireUser("/account/setting");
  const requestHeaders = await headers();
  const [sessions, accounts, nickname] = await Promise.all([
    auth.api.listSessions({ headers: requestHeaders }),
    auth.api.listUserAccounts({ headers: requestHeaders }),
    getMyNickname(),
  ]);

  const devices = sessions
    .map((s) => ({
      id: s.id,
      name: deviceName(s.userAgent),
      mobile: isMobileDevice(s.userAgent),
      current: s.id === session.session.id,
      createdAt: new Date(s.createdAt),
      updatedAt: new Date(s.updatedAt),
    }))
    // This device first, then the most recently used.
    .sort((a, b) => Number(b.current) - Number(a.current) || +b.updatedAt - +a.updatedAt);
  const hasOtherDevices = devices.some((device) => !device.current);

  const hasPassword = accounts.some((account) => account.providerId === "credential");
  // Anything that stops deletion besides the password, which the dialog asks for.
  const deletionProblem = accountDeletionProblem({
    role: session.user.role,
    impersonating: Boolean(session.session.impersonatedBy),
    hasPassword,
    passwordGiven: true,
  });

  return (
    <div className="rounded-card border border-border-subtle bg-bg-surface p-6 sm:p-8">
      <h1 className="font-display text-2xl font-bold">Setting</h1>
      <p className="mt-1 text-sm text-ink-muted">Your devices and your account</p>

      <section aria-labelledby="devices-heading" className="mt-8">
        <h2
          id="devices-heading"
          className="text-xs font-semibold uppercase tracking-wide text-ink-secondary"
        >
          Signed-in devices
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          Sign out anywhere you don&apos;t recognize or no longer use.
        </p>

        <ul className="mt-4 divide-y divide-border-subtle rounded-card border border-border-subtle">
          {devices.map((device) => {
            const Icon = device.mobile ? Smartphone : Monitor;
            return (
              <li key={device.id} className="flex items-center gap-3 p-4">
                <Icon className="h-5 w-5 shrink-0 text-ink-muted" aria-hidden />
                <div id={`device-${device.id}`} className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-ink-primary">
                    {device.name}
                    {device.current && (
                      <span className="rounded-pill bg-brand-pink/15 px-2 py-0.5 text-xs font-semibold text-ink-brand">
                        This device
                      </span>
                    )}
                  </p>
                  {/* Each date stays whole when a phone wraps the line. */}
                  <p className="mt-0.5 text-xs text-ink-muted">
                    <span className="whitespace-nowrap">
                      Signed in {DATE.format(device.createdAt)}
                    </span>{" "}
                    ·{" "}
                    <span className="whitespace-nowrap">
                      Last active {DATE.format(device.updatedAt)}
                    </span>
                  </p>
                </div>
                {!device.current && (
                  <form action={signOutDevice.bind(null, device.id)} className="shrink-0">
                    <button
                      type="submit"
                      aria-describedby={`device-${device.id}`}
                      className={SECONDARY_BUTTON}
                    >
                      Sign Out
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>

        {hasOtherDevices && (
          <form action={signOutOtherDevices} className="mt-4">
            <button type="submit" className={SECONDARY_BUTTON}>
              Sign Out All Other Devices
            </button>
          </form>
        )}
      </section>

      <section aria-labelledby="two-factor-heading" className="mt-10 border-t border-border-subtle pt-8">
        <h2
          id="two-factor-heading"
          className="text-xs font-semibold uppercase tracking-wide text-ink-secondary"
        >
          Two-factor sign-in
        </h2>
        <TwoFactorSetting
          enabled={Boolean(session.user.twoFactorEnabled)}
          hasPassword={hasPassword}
          isStaff={isStaffRole(session.user.role)}
        />
      </section>

      <section aria-labelledby="nickname-heading" className="mt-10 border-t border-border-subtle pt-8">
        <h2
          id="nickname-heading"
          className="text-xs font-semibold uppercase tracking-wide text-ink-secondary"
        >
          Nickname
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          Shown on your reviews and Community lists instead of your name, which stays private.
        </p>
        <NicknameSetting initial={nickname} />
      </section>

      <section aria-labelledby="data-heading" className="mt-10 border-t border-border-subtle pt-8">
        <h2
          id="data-heading"
          className="text-xs font-semibold uppercase tracking-wide text-ink-secondary"
        >
          Your data
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          Everything we keep about your account, as one file: your profile, nickname, favorites,
          Watchlist, lists, history, ratings, reviews and signed-in devices.
        </p>
        <a href="/api/account/export" download className={`mt-4 inline-block ${SECONDARY_BUTTON}`}>
          Download My Data
        </a>
      </section>

      <section aria-labelledby="delete-heading" className="mt-10 border-t border-border-subtle pt-8">
        <h2
          id="delete-heading"
          className="text-xs font-semibold uppercase tracking-wide text-ink-secondary"
        >
          Delete account
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          Deletes your profile, nickname, reviews, favorites, Watchlist, lists, ratings and watch
          history, and signs out every device. This can&apos;t be undone.
        </p>
        <div className="mt-4">
          {deletionProblem ? (
            <p className="text-sm text-ink-secondary">{deletionProblem}</p>
          ) : (
            <DeleteAccount hasPassword={hasPassword} />
          )}
        </div>
      </section>
    </div>
  );
}
