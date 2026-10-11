// A stand-in for Vercel Blob during the end-to-end tests: the server
// uploads posters itself (src/lib/admin-image-actions.ts), so the browser
// can't intercept it. playwright.config.ts starts it and points
// VERCEL_BLOB_API_URL here, with a token for a made-up store, "e2estore".
// GET /uploads lists what arrived, for the tests to check. Plain Node, no
// dependencies.
//
//   node e2e/blob-stub.mjs <port>

import { randomBytes } from "node:crypto";
import { createServer } from "node:http";

const port = Number(process.argv[2] ?? 3103);

// The same token as the test server's BLOB_READ_WRITE_TOKEN.
const TOKEN = "vercel_blob_rw_e2estore_e2esecret";
const PUBLIC_URL = "https://e2estore.public.blob.vercel-storage.com";

/** Every file stored: where, its type and its size. */
const uploads = [];

function send(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://localhost:${port}`);
  if (url.pathname === "/health") return send(response, 200, { ok: true });
  if (url.pathname === "/uploads") return send(response, 200, uploads);
  if (request.method === "PUT" && url.pathname === "/" && url.searchParams.has("pathname")) {
    if (request.headers.authorization !== `Bearer ${TOKEN}`) {
      return send(response, 403, { error: { code: "forbidden", message: "Access denied" } });
    }
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      let pathname = url.searchParams.get("pathname");
      if (request.headers["x-add-random-suffix"] === "1") {
        pathname = pathname.replace(/(\.[^./]+)?$/, `-${randomBytes(8).toString("hex")}$1`);
      }
      const contentType = request.headers["x-content-type"] ?? "application/octet-stream";
      uploads.push({
        pathname,
        contentType,
        access: request.headers["x-vercel-blob-access"],
        size: Buffer.concat(chunks).length,
      });
      send(response, 200, {
        url: `${PUBLIC_URL}/${pathname}`,
        downloadUrl: `${PUBLIC_URL}/${pathname}?download=1`,
        pathname,
        contentType,
        contentDisposition: `inline; filename="${pathname.split("/").pop()}"`,
        etag: `"${randomBytes(8).toString("hex")}"`,
      });
    });
    return;
  }
  send(response, 404, { error: { code: "not_found", message: "Not found" } });
}).listen(port, "127.0.0.1");
