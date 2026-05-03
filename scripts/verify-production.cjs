#!/usr/bin/env node

const https = require("node:https");
const pkg = require("../package.json");

const baseUrl = (process.argv[2] || process.env.PRODUCTION_URL || "").replace(/\/+$/, "");
if (!baseUrl) {
  console.error("Usage: npm run verify:production -- https://install-dashboard-web-app.vercel.app");
  process.exit(1);
}

const expectedVersion = pkg.version;
const requiredRoutes = [
  "/",
  "/login",
  "/dashboard",
  "/dashboard/warroom",
  "/dashboard/install",
  "/dashboard/equipment",
  "/dashboard/insights",
  "/dashboard/system",
  "/admin/users",
  "/admin/machine-models",
  "/admin/customer-sites",
];

function request(path) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      `${baseUrl}${path}`,
      {
        method: "GET",
        headers: {
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          resolve({
            path,
            status: res.statusCode,
            headers: res.headers,
            body,
          });
        });
      },
    );
    req.setTimeout(20000, () => {
      req.destroy(new Error(`Timeout requesting ${path}`));
    });
    req.on("error", reject);
    req.end();
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

(async () => {
  const version = await request("/version.json");
  assert(version.status === 200, `/version.json returned ${version.status}`);
  const payload = JSON.parse(version.body);
  assert(payload.version === expectedVersion, `/version.json expected ${expectedVersion}, got ${payload.version}`);
  assert(String(version.headers["cache-control"] || "").includes("no-store"), "/version.json must be no-store");

  const sw = await request("/sw.js");
  assert(sw.status === 200, `/sw.js returned ${sw.status}`);
  assert(sw.body.includes(`APP_VERSION = "${expectedVersion}"`), `/sw.js missing ${expectedVersion}`);
  assert(String(sw.headers["cache-control"] || "").includes("no-store"), "/sw.js must be no-store");

  for (const route of requiredRoutes) {
    const res = await request(route);
    assert(res.status === 200, `${route} returned ${res.status}`);
  }

  const cleanup = await request("/dashboard/cleanup");
  assert(cleanup.status === 404, `/dashboard/cleanup must be 404, got ${cleanup.status}`);

  console.log(`[verify-production] ${baseUrl} is serving ${expectedVersion} with no-store version assets.`);
})().catch((error) => {
  console.error(`[verify-production] ${error.message}`);
  process.exit(1);
});
