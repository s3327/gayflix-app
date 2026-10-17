import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { admin, emailOTP, twoFactor } from "better-auth/plugins";
import { after } from "next/server";
import { accountDeletionProblem } from "@/lib/account-deletion";
import { adminAccess } from "@/lib/admin-access";
import { db } from "@/lib/db";
import { sendEmail, type Email } from "@/lib/email";
import { siteUrl } from "@/lib/site-url";
import { userActionProblem } from "@/lib/user-admin";

/** Length of the email verification code; the /verify-email boxes match it. */
export const OTP_LENGTH = 6;

/**
 * Sends after the response is finished. Better Auth recommends not
 * awaiting delivery inside the request, so response timing can't reveal
 * whether an account exists; `after` keeps the send alive on serverless.
 */
function deliver(email: Email) {
  after(() =>
    sendEmail(email).catch((error: unknown) => {
      console.error("[email] delivery failed:", error);
    })
  );
}

const OTP_SUBJECTS = {
  "email-verification": "Your Gayflix verification code",
  "sign-in": "Your Gayflix sign-in code", // unused: code sign-in is disabled
  "forget-password": "Your Gayflix password reset code",
  "change-email": "Confirm your new Gayflix email",
} as const;

// The only endpoints that create a session after checking a second
// factor. Sessions made anywhere else (password alone, Google, email
// verification, impersonation) are not "two-factor verified".
const TWO_FACTOR_VERIFY_PATHS = new Set([
  "/two-factor/verify-totp",
  "/two-factor/verify-backup-code",
]);

// Google sign-in is offered once both credentials are set.
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

/**
 * Accounts, sessions and roles (Better Auth on Prisma Postgres).
 *
 * - Email + password, with the email confirmed by a 6-digit code before
 *   the first session. Passwords are hashed with scrypt.
 * - Google sign-in when GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are set.
 * - Password reset by emailed link (/reset-password); resetting signs out
 *   every other session. Signed-in users change their password with the
 *   current one, and their email with a code sent to the new address.
 * - Sessions live in the database behind an httpOnly cookie (Secure in
 *   production, SameSite=Lax).
 * - Roles come from the admin plugin: "user" by default, "admin" for
 *   the admin panel (see requireAdmin in src/lib/session.ts).
 * - Two-factor sign-in with an authenticator app (plus backup codes).
 *   Admins must turn it on, and the admin panel only accepts a session
 *   that passed it in the last 12 hours (src/lib/admin-access.ts). Each
 *   session records whether it did (`twoFactorVerified`).
 * - Members can delete their own account from /account/setting, with
 *   their password (src/lib/account-deletion.ts says who may). Their
 *   favorites, lists and history go with it.
 * - Rate limits are stored in the database so they hold across
 *   serverless instances.
 */
export const auth = betterAuth({
  appName: "Gayflix",
  baseURL: process.env.BETTER_AUTH_URL ?? siteUrl().origin,
  database: prismaAdapter(db, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 8,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      deliver({
        to: user.email,
        subject: "Reset your Gayflix password",
        text: `Someone asked to reset the password for this Gayflix account.\n\nReset it here (the link works for 1 hour):\n${url}\n\nIf this wasn't you, you can ignore this email.`,
      });
    },
  },
  emailVerification: {
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
  },
  user: { deleteUser: { enabled: true } },
  socialProviders:
    googleClientId && googleClientSecret
      ? { google: { clientId: googleClientId, clientSecret: googleClientSecret } }
      : {},
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // refresh the expiry at most once a day
    additionalFields: {
      twoFactorVerified: { type: "boolean", required: false, defaultValue: false, input: false },
    },
  },
  databaseHooks: {
    session: {
      create: {
        // Sessions never keep the IP address. Better Auth still reads it
        // from the request for its rate limits, which is why IP tracking
        // stays on (turning it off turns the rate limits off too). The
        // browser string stays: /account/setting names devices with it.
        before: async (session, ctx) => ({
          data: {
            ...session,
            ipAddress: null,
            twoFactorVerified: TWO_FACTOR_VERIFY_PATHS.has(ctx?.path ?? ""),
          },
        }),
      },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/delete-user") {
        const session = await getSessionFromCtx(ctx);
        if (!session) return; // the endpoint turns it away itself
        const credential = await ctx.context.internalAdapter.findCredentialAccount(session.user.id);
        const problem = accountDeletionProblem({
          role: session.user.role,
          impersonating: Boolean(session.session.impersonatedBy),
          hasPassword: Boolean(credential?.password),
          passwordGiven: Boolean(ctx.body?.password),
        });
        if (problem) throw new APIError("BAD_REQUEST", { message: problem });
        return;
      }
      // The admin plugin's own endpoints (/api/auth/admin/*) get the same check as the admin panel.
      if (!ctx.path.startsWith("/admin/") || ctx.path === "/admin/stop-impersonating") return;
      const session = await getSessionFromCtx(ctx);
      if (adminAccess(session) !== "ok") {
        throw new APIError("FORBIDDEN", { message: "Admin access needs a two-factor sign-in." });
      }

      // Check rules on allowed Better Auth admin endpoints
      const targetUserId = typeof ctx.body?.userId === "string" ? ctx.body.userId : null;
      if (targetUserId) {
        let action: "make-admin" | "remove-admin" | "ban" | "unban" | "sign-out" | null = null;
        if (ctx.path === "/admin/set-role") {
          action = ctx.body?.role === "admin" ? "make-admin" : "remove-admin";
        } else if (ctx.path === "/admin/ban-user") {
          action = "ban";
        } else if (ctx.path === "/admin/unban-user") {
          action = "unban";
        } else if (ctx.path === "/admin/revoke-user-sessions") {
          action = "sign-out";
        }

        if (action) {
          const target = await db.user.findUnique({
            where: { id: targetUserId },
            select: { id: true, role: true, emailVerified: true, banned: true, banExpires: true },
          });
          if (!target) throw new APIError("BAD_REQUEST", { message: "No such user." });
          const problem = userActionProblem(action, session!.user.id, target);
          if (problem) throw new APIError("BAD_REQUEST", { message: problem });
        }
      }
    }),
  },
  disabledPaths: [
    // Sign-in and password reset by emailed code: the UI doesn't use
    // them, and code sign-in would skip two-factor.
    "/sign-in/email-otp",
    "/email-otp/request-password-reset",
    "/forget-password/email-otp",
    "/email-otp/reset-password",
    // Admin endpoints that would get around the panel's rules
    // (src/lib/user-admin.ts): the panel never calls them.
    "/admin/create-user",
    "/admin/update-user",
    "/admin/remove-user",
    "/admin/set-user-password",
    "/admin/impersonate-user",
    "/admin/stop-impersonating",
    "/admin/list-user-sessions",
    "/admin/revoke-user-session",
  ],
  rateLimit: {
    // On in production by default. AUTH_RATE_LIMIT=off exists only for
    // the e2e suite, which signs in many times from one address.
    enabled: process.env.AUTH_RATE_LIMIT === "off" ? false : undefined,
    storage: "database",
  },
  plugins: [
    emailOTP({
      otpLength: OTP_LENGTH,
      expiresIn: 10 * 60,
      allowedAttempts: 5,
      storeOTP: "hashed",
      sendVerificationOnSignUp: true,
      overrideDefaultEmailVerification: true,
      // /account's "Change Email": a code goes to the new address, and
      // the change only happens once that code is entered.
      changeEmail: { enabled: true },
      async sendVerificationOTP({ email, otp, type }) {
        deliver({
          to: email,
          subject: OTP_SUBJECTS[type],
          text: `Your Gayflix code is ${otp}\n\nIt expires in 10 minutes. If you didn't ask for it, you can ignore this email.`,
        });
      },
    }),
    admin({ defaultRole: "user", adminRoles: ["admin"] }),
    twoFactor({ issuer: "Gayflix" }),
    // Must stay last: lets server actions set auth cookies.
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
