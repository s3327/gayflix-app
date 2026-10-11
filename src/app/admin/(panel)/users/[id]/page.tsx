import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import ConfirmSubmitButton from "@/components/admin/ConfirmSubmitButton";
import {
  BUTTON_DANGER,
  BUTTON_SECONDARY,
  SelectField,
  TextField,
} from "@/components/admin/FormFields";
import UserBadges from "@/components/admin/UserBadges";
import {
  banUser,
  makeAdmin,
  removeAdmin,
  signOutEverywhere,
  unbanUser,
} from "@/lib/admin-user-actions";
import { getUserForAdmin } from "@/lib/admin-users";
import { requireAdmin } from "@/lib/session";
import {
  BAN_LENGTHS,
  BAN_REASON_MAX,
  isAdmin,
  isBanned,
  userActionProblem,
  type UserAction,
} from "@/lib/user-admin";

const date = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });
const dateTime = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

const SIGN_IN_METHODS: Record<string, string> = { credential: "Password", google: "Google" };

function devices(count: number) {
  return count === 1 ? "1 device" : `${count} devices`;
}

/**
 * /admin/users/[id]: one account, with its admin access, ban and
 * sessions. Admins can't change their own account here.
 */
export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  const { id } = await params;
  const user = await getUserForAdmin(id);
  if (!user) notFound();

  const isSelf = user.id === session.user.id;
  const admin = isAdmin(user);
  const banned = isBanned(user);
  const problem = (action: UserAction) => userActionProblem(action, session.user.id, user);
  const methods = user.signInMethods.map((method) => SIGN_IN_METHODS[method] ?? method);

  return (
    <div className="px-6 py-10 sm:px-10">
      <Link
        href="/admin/users"
        className="inline-flex items-center gap-1.5 text-sm text-ink-secondary transition-colors hover:text-ink-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Users
      </Link>

      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="min-w-0 break-words font-display text-2xl font-bold">{user.name}</h1>
        <UserBadges user={user} />
      </div>
      <p className="mt-1 break-all text-sm text-ink-secondary">{user.email}</p>

      {isSelf && (
        <p className="mt-6 max-w-2xl text-sm text-ink-secondary">
          This is your account. Another admin can change it; you can change your own password and
          email on your <Link href="/account" className="text-ink-brand underline underline-offset-2">account page</Link>.
        </p>
      )}

      <dl className="mt-8 grid max-w-2xl grid-cols-1 gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
        <Fact label="Joined">{date.format(user.createdAt)}</Fact>
        <Fact label="Email">{user.emailVerified ? "Confirmed" : "Not confirmed yet"}</Fact>
        <Fact label="Signs in with">{methods.length > 0 ? methods.join(", ") : "Nothing yet"}</Fact>
        <Fact label="Two-factor">{user.twoFactorEnabled ? "On" : "Off"}</Fact>
        <Fact label="Signed in on">
          {user.openSessions > 0 ? devices(user.openSessions) : "No devices"}
        </Fact>
        <Fact label="Last active">{user.lastActive ? date.format(user.lastActive) : "Not yet"}</Fact>
        <Fact label="Reports sent">{user._count.reports}</Fact>
      </dl>

      <div className="mt-10 flex max-w-2xl flex-col gap-6">
        <Section title="Admin access">
          {admin ? (
            <p>This account can use the admin panel.</p>
          ) : (
            <p>
              Admins can change every title, account and report. A new admin sets up two-factor the
              first time they open the panel.
            </p>
          )}
          {!isSelf && (
            <Action problem={problem(admin ? "remove-admin" : "make-admin")}>
              <form action={(admin ? removeAdmin : makeAdmin).bind(null, user.id)}>
                <ConfirmSubmitButton
                  confirmTitle={admin ? "Remove admin access?" : "Make this account an admin?"}
                  confirmDescription={
                    admin
                      ? `${user.email} will no longer be able to open the admin panel. Their account keeps working on the site.`
                      : `${user.email} will be able to change every title, account and report.`
                  }
                  confirmLabel={admin ? "Remove admin access" : "Make admin"}
                  className={admin ? BUTTON_DANGER : BUTTON_SECONDARY}
                >
                  {admin ? "Remove admin access" : "Make admin"}
                </ConfirmSubmitButton>
              </form>
            </Action>
          )}
        </Section>

        <Section title="Ban">
          {banned ? (
            <>
              <p>
                Banned{" "}
                {user.banExpires ? `until ${dateTime.format(user.banExpires)} UTC` : "until unbanned"}.
                It can&apos;t sign in.
              </p>
              {/* Better Auth saves "No reason" when none was given. */}
              {user.banReason && user.banReason !== "No reason" && (
                <p className="mt-2 break-words">Reason: {user.banReason}</p>
              )}
              {!isSelf && (
                <Action problem={problem("unban")}>
                  <form action={unbanUser.bind(null, user.id)}>
                    <button type="submit" className={BUTTON_SECONDARY}>
                      Unban
                    </button>
                  </form>
                </Action>
              )}
            </>
          ) : (
            <>
              <p>Banning signs the account out everywhere and stops it signing in.</p>
              {!isSelf && (
                <Action problem={problem("ban")}>
                  <form action={banUser.bind(null, user.id)} className="flex flex-col gap-4">
                    <TextField
                      name="reason"
                      label="Reason"
                      optional
                      maxLength={BAN_REASON_MAX}
                      hint="Only admins see it."
                    />
                    <SelectField name="length" label="How long" defaultValue="forever">
                      {BAN_LENGTHS.map((length) => (
                        <option key={length.value} value={length.value}>
                          {length.label}
                        </option>
                      ))}
                    </SelectField>
                    <div>
                      <button type="submit" className={BUTTON_DANGER}>
                        Ban
                      </button>
                    </div>
                  </form>
                </Action>
              )}
            </>
          )}
        </Section>

        <Section title="Sessions">
          <p>
            {user.openSessions > 0
              ? `Signed in on ${devices(user.openSessions)}. Signing out ends every session; the account can sign in again.`
              : "Not signed in anywhere."}
          </p>
          {!isSelf && user.openSessions > 0 && (
            <Action problem={problem("sign-out")}>
              <form action={signOutEverywhere.bind(null, user.id)}>
                <button type="submit" className={BUTTON_SECONDARY}>
                  Sign out everywhere
                </button>
              </form>
            </Action>
          )}
        </Section>
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className="mt-1 text-ink-primary">{children}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const headingId = `section-${title.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <section
      aria-labelledby={headingId}
      className="rounded-card border border-border-subtle bg-bg-surface p-5 text-sm text-ink-secondary"
    >
      <h2 id={headingId} className="mb-2 font-display text-lg font-semibold text-ink-primary">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** The action's form, or why it isn't offered. */
function Action({ problem, children }: { problem: string | null; children: React.ReactNode }) {
  return <div className="mt-4">{problem ? <p className="text-ink-muted">{problem}</p> : children}</div>;
}
