/**
 * The emails Gayflix sends (src/lib/auth.ts), each as a plain-text body
 * and a branded HTML one. The HTML is a single centred card in the
 * site's colours, with inline styles and tables, since email apps drop
 * <style> blocks and most CSS layout. The logo is an image from the
 * site; with images off, its alt text still says Gayflix.
 */

export type EmailContent = { subject: string; text: string; html: string };

export type CodePurpose = "email-verification" | "sign-in" | "forget-password" | "change-email";

const COLORS = {
  page: "#0b0b0f",
  card: "#17171f",
  codeBox: "#22222c",
  pink: "#e40087",
  pinkText: "#f13da8",
  ink: "#ffffff",
  secondary: "#b7b7c3",
  muted: "#878794",
  border: "#2a2a35",
};

const FONT = "'Baloo 2', 'Segoe UI', Helvetica, Arial, sans-serif";

/** Escapes text for HTML, attribute values included. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type Block =
  | { kind: "paragraph"; text: string }
  | { kind: "code"; code: string }
  | { kind: "button"; label: string; url: string };

/** The shared card: logo, heading, the blocks, then a muted footnote. */
function layout({
  origin,
  preheader,
  heading,
  blocks,
  footnote,
}: {
  origin: string;
  preheader: string;
  heading: string;
  blocks: Block[];
  footnote: string;
}): string {
  const body = blocks
    .map((block) => {
      switch (block.kind) {
        case "paragraph":
          return `<p style="margin:0 0 16px;font-size:16px;line-height:24px;color:${COLORS.secondary};">${escapeHtml(block.text)}</p>`;
        case "code":
          return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;"><tr><td style="background:${COLORS.codeBox};border:1px solid ${COLORS.border};border-radius:12px;padding:14px 24px;font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:32px;line-height:40px;font-weight:700;letter-spacing:8px;color:${COLORS.ink};">${escapeHtml(block.code)}</td></tr></table>`;
        case "button":
          return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;"><tr><td style="background:${COLORS.pink};border-radius:999px;"><a href="${escapeHtml(block.url)}" style="display:inline-block;padding:12px 28px;font-family:${FONT};font-size:16px;font-weight:700;color:${COLORS.ink};text-decoration:none;">${escapeHtml(block.label)}</a></td></tr></table><p style="margin:0 0 16px;font-size:13px;line-height:20px;color:${COLORS.muted};">Or paste this link into your browser:<br><a href="${escapeHtml(block.url)}" style="color:${COLORS.pinkText};word-break:break-all;">${escapeHtml(block.url)}</a></p>`;
      }
    })
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.page}" style="background:${COLORS.page};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;">
<tr><td align="center" style="padding:0 0 24px;"><a href="${escapeHtml(origin)}" style="text-decoration:none;"><img src="${escapeHtml(`${origin}/brand/gayflix-logo-full.png`)}" width="150" height="100" alt="Gayflix" style="display:block;border:0;width:150px;height:auto;font-family:${FONT};font-size:28px;font-weight:700;color:${COLORS.pinkText};"></a></td></tr>
<tr><td bgcolor="${COLORS.card}" style="background:${COLORS.card};border:1px solid ${COLORS.border};border-radius:16px;padding:32px 28px;font-family:${FONT};">
<h1 style="margin:0 0 16px;font-family:${FONT};font-size:24px;line-height:32px;font-weight:700;color:${COLORS.ink};">${escapeHtml(heading)}</h1>
${body}
<p style="margin:8px 0 0;padding-top:16px;border-top:1px solid ${COLORS.border};font-size:13px;line-height:20px;color:${COLORS.muted};">${escapeHtml(footnote)}</p>
</td></tr>
<tr><td align="center" style="padding:24px 0 0;font-family:${FONT};font-size:12px;line-height:18px;color:${COLORS.muted};">Gayflix &middot; <a href="${escapeHtml(origin)}" style="color:${COLORS.muted};">${escapeHtml(new URL(origin).host)}</a></td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

const CODE_EMAILS: Record<CodePurpose, { subject: string; heading: string; purpose: string }> = {
  "email-verification": {
    subject: "Your Gayflix verification code",
    heading: "Confirm your email",
    purpose: "Enter this code to confirm your email and finish signing up for Gayflix.",
  },
  // Unused: code sign-in is disabled.
  "sign-in": {
    subject: "Your Gayflix sign-in code",
    heading: "Your sign-in code",
    purpose: "Enter this code to log in to Gayflix.",
  },
  "forget-password": {
    subject: "Your Gayflix password reset code",
    heading: "Reset your password",
    purpose: "Enter this code to choose a new password for your Gayflix account.",
  },
  "change-email": {
    subject: "Confirm your new Gayflix email",
    heading: "Confirm your new email",
    purpose: "Enter this code to make this your Gayflix email. Your account keeps using the old one until you do.",
  },
};

/** A one-time code, with a line saying what it's for. */
export function codeEmail(
  purpose: CodePurpose,
  code: string,
  minutes: number,
  origin: string
): EmailContent {
  const { subject, heading, purpose: line } = CODE_EMAILS[purpose];
  const expiry = `It expires in ${minutes} minutes.`;
  const footnote = "If you didn't ask for it, you can ignore this email.";
  return {
    subject,
    text: `${line}\n\nYour Gayflix code is ${code}\n\n${expiry} ${footnote}`,
    html: layout({
      origin,
      preheader: `Your Gayflix code is ${code}`,
      heading,
      blocks: [
        { kind: "paragraph", text: line },
        { kind: "code", code },
        { kind: "paragraph", text: expiry },
      ],
      footnote,
    }),
  };
}

/** The password reset link. */
export function resetPasswordEmail(url: string, origin: string): EmailContent {
  const line = "Someone asked to reset the password for this Gayflix account.";
  const footnote = "If this wasn't you, you can ignore this email. Your password stays the same.";
  return {
    subject: "Reset your Gayflix password",
    text: `${line}\n\nReset it here (the link works for 1 hour):\n${url}\n\n${footnote}`,
    html: layout({
      origin,
      preheader: "Reset your password with the link inside. It works for 1 hour.",
      heading: "Reset your password",
      blocks: [
        { kind: "paragraph", text: `${line} The link works for 1 hour.` },
        { kind: "button", label: "Reset password", url },
      ],
      footnote,
    }),
  };
}

/** Sent instead of a code when someone signs up with an address that has an account. */
export function existingAccountEmail(origin: string): EmailContent {
  const line = "Someone tried to sign up for Gayflix with this email, which already has an account.";
  const footnote = "If it wasn't you, you can ignore this email. Nothing about your account has changed.";
  return {
    subject: "You already have a Gayflix account",
    text: `${line}\n\nIf it was you, log in here:\n${origin}/login\n\nForgot your password? Reset it here:\n${origin}/forgot-password\n\n${footnote}`,
    html: layout({
      origin,
      preheader: "This email already has a Gayflix account. Log in instead.",
      heading: "You already have an account",
      blocks: [
        { kind: "paragraph", text: `${line} If it was you, log in instead.` },
        { kind: "button", label: "Log in", url: `${origin}/login` },
        { kind: "paragraph", text: "Forgot your password? You can reset it from the log-in page." },
      ],
      footnote,
    }),
  };
}

/** Tells the old address that the account's email changed. */
export function emailChangedEmail(newEmail: string, origin: string): EmailContent {
  const line = `The email for your Gayflix account was just changed to ${newEmail}. Codes and password resets now go there.`;
  const done = "If you made this change, there's nothing more to do.";
  const footnote =
    "If you didn't, someone else may be signed in to your account. Reply to this email and we'll help you get it back.";
  return {
    subject: "Your Gayflix email was changed",
    text: `${line}\n\n${done}\n\n${footnote}`,
    html: layout({
      origin,
      preheader: `Your Gayflix email is now ${newEmail}.`,
      heading: "Your email was changed",
      blocks: [
        { kind: "paragraph", text: line },
        { kind: "paragraph", text: done },
      ],
      footnote,
    }),
  };
}

/** A series in a new-episodes email, with the episodes it got. */
export type NewEpisodesSeries = { title: string; url: string; episodes: string[] };

/** Most episodes named per series; the rest are counted. */
const EPISODES_LISTED = 10;

/**
 * New episodes of series in a member's Favorites (src/lib/new-episode-emails.ts),
 * all in one email, with a one-click way to stop them.
 */
export function newEpisodesEmail(series: NewEpisodesSeries[], unsubscribeUrl: string, origin: string): EmailContent {
  const names = series.map((each) => each.title);
  const subject =
    series.length === 1
      ? `New on Gayflix: ${names[0]}`
      : `New episodes of ${names.length} series you favorited`;
  const lines = series.map(({ title, episodes }) => {
    const listed = episodes.slice(0, EPISODES_LISTED).join(", ");
    const more = episodes.length > EPISODES_LISTED ? `, and ${episodes.length - EPISODES_LISTED} more` : "";
    return `${title}: ${listed}${more}`;
  });
  const intro =
    series.length === 1 ? "A series in your Favorites has new episodes." : "Series in your Favorites have new episodes.";
  const footnote = "You get these because these series are in your Favorites.";
  return {
    subject,
    text: `${intro}\n\n${series.map((each, i) => `${lines[i]}\n${each.url}`).join("\n\n")}\n\n${footnote} Stop them: ${unsubscribeUrl}`,
    html: layout({
      origin,
      preheader: lines[0],
      heading: "New episodes",
      blocks: [
        { kind: "paragraph", text: intro },
        ...series.flatMap((each, i) => [
          { kind: "paragraph" as const, text: lines[i] },
          { kind: "button" as const, label: `Watch ${each.title}`, url: each.url },
        ]),
        { kind: "paragraph", text: `Don't want these? Stop them here: ${unsubscribeUrl}` },
      ],
      footnote,
    }),
  };
}
