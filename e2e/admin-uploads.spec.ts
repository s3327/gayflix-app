import type { Page } from "@playwright/test";
import { BLOB_STUB } from "../playwright.config";
import { ADMIN_STATE, sql } from "./accounts";
import { ADMIN_CREDENTIALS, expect, test } from "./fixtures";

/*
 * Poster and backdrop uploads in the admin title editor
 * (src/lib/admin-image-actions.ts), kept by a stand-in Vercel Blob store,
 * e2e/blob-stub.mjs.
 */

/** A 1×1 PNG. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);
const STORE = "https://e2estore.public.blob.vercel-storage.com";

type Upload = { pathname: string; contentType: string; access: string; size: number };

async function uploads(): Promise<Upload[]> {
  return (await fetch(`${BLOB_STUB}/uploads`)).json();
}

/** Picks `file` with the field's Upload button. */
async function upload(page: Page, button: string, file: { name: string; mimeType: string; buffer: Buffer }) {
  const chooser = page.waitForEvent("filechooser");
  await page.locator("main").getByRole("button", { name: button }).click();
  await (await chooser).setFiles(file);
}

test.use({ httpCredentials: ADMIN_CREDENTIALS, storageState: ADMIN_STATE });

test("uploads a poster for a new movie, then a backdrop for it", async ({ page, consoleProblems }) => {
  void consoleProblems;
  const uid = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const id = `e2e-upload-${uid}`;
  const main = page.locator("main");
  try {
    await page.goto("/admin/upload/movies");
    await main.getByLabel("Title", { exact: true }).fill(`E2E Upload ${uid}`);
    await main.getByLabel("Year").fill("2024");
    await main.getByLabel("Runtime in minutes").fill("90");
    await main.getByLabel("Genres").fill("Drama");
    await main.getByLabel("Country").fill("Canada");
    await main.getByLabel("Language").fill("English");

    await upload(page, "Upload a poster", { name: "my poster.png", mimeType: "image/png", buffer: PNG });
    await expect(main.getByRole("status")).toHaveText("Uploaded. Save to use it.");
    const poster = main.getByLabel("Poster image link");
    await expect(poster).toHaveValue(new RegExp(`^${STORE}/posters/poster-[0-9a-f]{16}\\.png$`));
    const posterUrl = await poster.inputValue();
    const stored = (await uploads()).find((u) => posterUrl.endsWith(`/${u.pathname}`));
    expect(stored).toEqual({ pathname: expect.any(String), contentType: "image/png", access: "public", size: PNG.length });

    await main.getByRole("button", { name: "Add movie" }).click();
    await expect(page).toHaveURL(`/admin/library/movies/${id}?added=1`);
    expect(await sql(`SELECT "posterUrl" FROM media WHERE id = $1`, [id])).toEqual([{ posterUrl }]);

    // The edit page uploads too.
    await upload(page, "Upload a backdrop", { name: "wide.png", mimeType: "image/png", buffer: PNG });
    await expect(main.getByRole("status").filter({ hasText: "Uploaded" })).toHaveText("Uploaded. Save to use it.");
    const backdropUrl = await main.getByLabel("Backdrop image link").inputValue();
    expect(backdropUrl).toMatch(new RegExp(`^${STORE}/backdrops/backdrop-[0-9a-f]{16}\\.png$`));
    await main.getByRole("button", { name: "Save changes" }).click();
    await expect(main.getByText("Saved.", { exact: true })).toBeVisible();
    expect(await sql(`SELECT "posterUrl", "backdropUrl" FROM media WHERE id = $1`, [id])).toEqual([
      { posterUrl, backdropUrl },
    ]);
  } finally {
    await sql(`DELETE FROM media WHERE id = $1`, [id]);
  }
});

test("refuses files that aren't images, and images over 4 MB", async ({ page, consoleProblems }) => {
  void consoleProblems;
  const main = page.locator("main");
  const poster = main.getByLabel("Poster image link");
  await page.goto("/admin/upload/movies");

  // Checked by its bytes, not its name or type.
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  await upload(page, "Upload a poster", { name: "poster.png", mimeType: "image/png", buffer: svg });
  await expect(main.getByRole("alert")).toHaveText("Upload a JPEG, PNG, WebP or AVIF image.");
  await expect(poster).toHaveValue("");

  // Too big to send: the browser stops it.
  const big = Buffer.concat([PNG, Buffer.alloc(4 * 1024 * 1024)]);
  await upload(page, "Upload a poster", { name: "huge.png", mimeType: "image/png", buffer: big });
  await expect(main.getByRole("alert")).toHaveText("That image is over 4 MB. Upload a smaller one.");
  await expect(poster).toHaveValue("");
  expect((await uploads()).filter((u) => u.size >= big.length)).toEqual([]);

  // A link still works after either.
  await poster.fill("https://picsum.photos/seed/e2e-upload/500/750");
  await expect(main.getByRole("alert")).toHaveCount(0);
});
