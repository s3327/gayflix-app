import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { admin, emailOTP } from "better-auth/plugins";
import { after } from "next/server";
import { db } from "@/lib/db";
import { sendEmail, type Email } from "@/lib/email";
import { siteUrl } from "@/lib/site-url";

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
  "sign-in": "Your Gayflix sign-in code",
  "forget-password": "Your Gayflix password reset code",
  "change-email": "Confirm your new Gayflix email",
} as const;

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
 *   every other session.
 * - Sessions live in the database behind an httpOnly cookie (Secure in
 *   production, SameSite=Lax).
 * - Roles come from the admin plugin: "user" by default, "admin" for
 *   the admin panel (see requireAdmin in src/lib/session.ts).
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
  socialProviders:
    googleClientId && googleClientSecret
      ? { google: { clientId: googleClientId, clientSecret: googleClientSecret } }
      : {},
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // refresh the expiry at most once a day
  },
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
      async sendVerificationOTP({ email, otp, type }) {
        deliver({
          to: email,
          subject: OTP_SUBJECTS[type],
          text: `Your Gayflix code is ${otp}\n\nIt expires in 10 minutes. If you didn't ask for it, you can ignore this email.`,
        });
      },
    }),
    admin({ defaultRole: "user", adminRoles: ["admin"] }),
    // Must stay last: lets server actions set auth cookies.
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
