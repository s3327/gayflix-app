import { BASE_URL, REPORT_STUB } from "../playwright.config";
import { accounts, USER_STATE } from "./accounts";
import { expect, test } from "./fixtures";

/*
 * Crash reports (src/lib/error-reporting.ts) reach Sentry, played here
 * by e2e/report-stub.mjs, and carry nothing personal.
 */

type Report = { userAgent: string; lines: string[] };

async function reports(): Promise<Report[]> {
  return (await fetch(`${REPORT_STUB}/reports`)).json();
}

function parse(line: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
}

test.skip(!process.env.NEXT_PUBLIC_SENTRY_DSN, "Needs a build with NEXT_PUBLIC_SENTRY_DSN set (CI sets it)");
test.use({ storageState: USER_STATE });

test("a crash in the browser is reported, with nothing personal", async ({ page, context }) => {
  const message = `E2E crash ${Date.now()}`;
  await page.goto("/home?q=private-search");
  await page.evaluate((message) => {
    setTimeout(() => {
      throw new Error(message);
    });
  }, message);

  let report: Report | undefined;
  await expect
    .poll(async () => {
      report = (await reports()).find((r) => r.lines.some((line) => line.includes(message)));
      return report;
    })
    .toBeDefined();
  // An envelope: its header, then each item's header and the item.
  const lines = report!.lines;
  const event = parse(lines[lines.findIndex((line) => parse(line)?.type === "event") + 1]) as {
    exception: { values: { value: string }[] };
    request: { url: string; headers?: Record<string, string> };
    user?: { ip_address?: string };
  };
  expect(event.exception.values[0].value).toBe(message);
  expect(event.request.url).toBe(`${BASE_URL}/home`);
  expect(event.user?.ip_address).toBeUndefined();

  const sessionCookie = (await context.cookies()).find((c) => c.name.endsWith("session_token"));
  expect(sessionCookie).toBeDefined();
  for (const personal of ["private-search", sessionCookie!.value, accounts().user.email]) {
    expect(lines.join("\n")).not.toContain(personal);
  }

  // Page views aren't reported: no browser in the whole run, across
  // every test so far, has sent a "session".
  const fromBrowsers = (await reports()).filter((r) => r.userAgent.includes("Chrome"));
  expect(fromBrowsers.flatMap((r) => r.lines.map((line) => parse(line)?.type))).not.toContain("session");
});
