import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import ConfirmSubmitButton from "@/components/admin/ConfirmSubmitButton";
import EditUserModal from "@/components/admin/EditUserModal";
import UserRoleSection from "@/components/admin/UserRoleSection";
import Reset2FaButton from "@/components/admin/Reset2FaButton";
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
import { getEntityActivity } from "@/lib/activity-logger";
import { isOwner } from "@/lib/admin-roles";
import { requireAdmin } from "@/lib/session";
import {
  BAN_LENGTHS,
  BAN_REASON_MAX,
  isAdmin,
  isBanned,
  userActionProblem,
  type UserAction,
} from "@/lib/user-admin";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const user = await getUserForAdmin(id);
  return { title: user?.name ? `${user.name} (${user.email})` : user?.email ?? "User" };
}

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
  const [user, userActivity] = await Promise.all([getUserForAdmin(id), getEntityActivity("user", id, 10)]);
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

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <h1 className="min-w-0 break-words font-display text-2xl font-bold">{user.name}</h1>
            <UserBadges user={user} />
          </div>
          <p className="mt-1 break-all text-sm text-ink-secondary">{user.email}</p>
        </div>
        <EditUserModal
          user={{
            id: user.id,
            name: user.name,
            email: user.email,
            emailVerified: user.emailVerified,
          }}
        />
      </div>

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
        <Section title="Role & Permissions">
          <UserRoleSection
            userId={user.id}
            currentRole={user.role ?? "user"}
            isSelf={isSelf}
            isViewerOwner={isOwner(session.user.role)}
          />
        </Section>

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
                      <ConfirmSubmitButton
                        confirmTitle="Ban this account?"
                        confirmDescription={`Banning ${user.email} will sign them out of all devices and prevent them from signing in.`}
                        confirmLabel="Ban"
                        className={BUTTON_DANGER}
                      >
                        Ban
                      </ConfirmSubmitButton>
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
                <ConfirmSubmitButton
                  confirmTitle="Sign out everywhere?"
                  confirmDescription={`This will end all ${user.openSessions} active sessions for ${user.email}.`}
                  confirmLabel="Sign out everywhere"
                  className={BUTTON_SECONDARY}
                >
                  Sign out everywhere
                </ConfirmSubmitButton>
              </form>
            </Action>
          )}
        </Section>

        {user.twoFactorEnabled && (
          <Section title="Two-Factor Authentication">
            <p>Two-factor authentication is active on this account.</p>
            {!isSelf && (
              <div className="mt-4">
                <Reset2FaButton userId={user.id} userEmail={user.email} />
              </div>
            )}
          </Section>
        )}

        <Section title="Recent activity">
          {userActivity.length === 0 ? (
            <p className="text-xs text-ink-muted">No activity recorded for this user yet.</p>
          ) : (
            <ul className="divide-y divide-border-subtle/50 text-xs">
              {userActivity.map((act) => (
                <li key={act.id} className="py-2.5 flex items-start justify-between gap-3">
                  <div>
                    <span className="font-medium text-ink">{act.summary}</span>
                    <span className="block text-2xs text-ink-secondary">by {act.actorEmail}</span>
                  </div>
                  <span className="shrink-0 text-2xs text-ink-muted">
                    {dateTime.format(new Date(act.createdAt))}
                  </span>
                </li>
              ))}
            </ul>
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
