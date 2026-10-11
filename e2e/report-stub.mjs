// A stand-in for Sentry during the end-to-end tests: CI builds the site
// with NEXT_PUBLIC_SENTRY_DSN pointing here, so both the browser and the
// server send their crash reports to this. GET /reports lists what
// arrived, for the tests to check. Plain Node, no dependencies.
//
//   node e2e/report-stub.mjs <port>

import { createServer } from "node:http";
import { gunzipSync } from "node:zlib";

const port = Number(process.argv[2] ?? 3102);

/** Every envelope received: who sent it, and its lines as sent. */
const reports = [];

function send(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json",
    // Browsers send reports from the site's origin.
    "Access-Control-Allow-Origin": "*",
  });
  response.end(JSON.stringify(body));
}

createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://localhost:${port}`);
  if (url.pathname === "/health") return send(response, 200, { ok: true });
  if (url.pathname === "/reports") return send(response, 200, reports);
  if (request.method === "POST" && /^\/api\/\d+\/envelope\/$/.test(url.pathname)) {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      let body = Buffer.concat(chunks);
      if (request.headers["content-encoding"] === "gzip") body = gunzipSync(body);
      reports.push({
        userAgent: request.headers["user-agent"] ?? "",
        lines: body.toString("utf8").split("\n").filter(Boolean),
      });
      send(response, 200, {});
    });
    return;
  }
  send(response, 404, {});
}).listen(port, "127.0.0.1");
