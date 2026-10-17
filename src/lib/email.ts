import { appendFile } from "node:fs/promises";

/** `html` is the branded version (src/lib/email-templates.ts); `text` is always sent too. */
export type Email = { to: string; subject: string; text: string; html?: string };

/**
 * Sends a transactional email (verification codes, password resets).
 *
 * - `RESEND_API_KEY` set: sent through Resend's HTTP API from `EMAIL_FROM`.
 * - `EMAIL_OUTBOX_FILE` set: appended to that file as one JSON line per
 *   email. The e2e tests read codes from it.
 * - Otherwise, outside production: printed to the server console.
 * - Otherwise, in production: an error, so a missing provider is loud
 *   rather than users silently never getting their codes.
 */
export async function sendEmail(
  email: Email,
  env: Record<string, string | undefined> = process.env
): Promise<void> {
  if (env.RESEND_API_KEY) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM ?? "Gayflix <onboarding@resend.dev>",
        to: [email.to],
        subject: email.subject,
        text: email.text,
        ...(email.html && { html: email.html }),
      }),
    });
    if (!response.ok) {
      throw new Error(`Email provider rejected the message (${response.status})`);
    }
    return;
  }

  if (env.EMAIL_OUTBOX_FILE) {
    await appendFile(env.EMAIL_OUTBOX_FILE, JSON.stringify({ ...email, sentAt: Date.now() }) + "\n");
    return;
  }

  if (env.NODE_ENV !== "production") {
    console.info(`[email] to=${email.to} subject="${email.subject}"\n${email.text}`);
    return;
  }

  throw new Error("No email provider configured: set RESEND_API_KEY and EMAIL_FROM");
}
