import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import process from "node:process";
import console from "node:console";
import { URL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { request } from "@playwright/test";

const baseURL =
  process.env.PRISM_BASE_URL ||
  (process.argv.includes("--native")
    ? "http://localhost:4400"
    : "http://localhost:8080");
const origin = new URL(baseURL).origin;
assert(
  ["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname),
  "Workspace smoke tests must target a local workspace",
);
const contexts = [];

async function write(context, method, path, data) {
  const state = await context.storageState();
  const csrf =
    state.cookies.find((cookie) => cookie.name === "prism_csrf")?.value || "";
  return context.fetch(path, {
    method,
    headers: { Origin: origin, "X-CSRF-Token": csrf },
    data,
  });
}

async function until(check) {
  for (let attempt = 0; attempt < 120; attempt++) {
    const result = await check();
    if (result) return result;
    await delay(500);
  }
  throw new Error("Timed out waiting for a background job");
}

try {
  const publicClient = await request.newContext({ baseURL });
  contexts.push(publicClient);
  const health = await publicClient.get("/health/ready");
  assert.equal(health.status(), 200, "All dependencies must be ready");
  const status = await health.json();
  for (const dependency of ["api", "database", "redis", "worker"])
    assert.equal(status[dependency], true);
  console.log("PASS: Web, API, PostgreSQL, Redis and worker readiness");

  const accounts = new Map();
  for (const role of ["ADMIN", "ANALYST", "VIEWER"]) {
    const context = await request.newContext({ baseURL });
    contexts.push(context);
    assert.equal(
      (
        await context.post("/api/v1/auth/login", {
          data: {
            email: `${role.toLowerCase()}@prism.local`,
            password: process.env.SEED_PASSWORD || "PrismAccess2026!",
          },
        })
      ).status(),
      200,
    );
    const identity = await (await context.get("/api/v1/auth/me")).json();
    assert.equal(identity.role, role);
    assert.equal(identity.workspaceId, "northstar");
    assert.equal((await context.get("/api/v1/data-sources")).status(), 200);
    assert.equal(
      (await context.get("/api/v1/settings/team")).status(),
      role === "ADMIN" ? 200 : 403,
    );
    assert.equal(
      (await context.get("/api/v1/data/orders/export")).status(),
      role === "VIEWER" ? 403 : 200,
    );
    assert.equal(
      (
        await write(context, "PATCH", "/api/v1/settings/workspace", {})
      ).status(),
      role === "ADMIN" ? 400 : 403,
    );
    accounts.set(role, context);
  }
  console.log("PASS: Three persisted accounts have distinct API permissions");

  const admin = accounts.get("ADMIN");
  const sources = await (await admin.get("/api/v1/data-sources")).json();
  const source = sources.find(
    (item) => item.provider === "SHOPIFY" && item.mode === "GENERATED",
  );
  assert(source, "Generated Shopify source must be seeded");
  for (const role of ["ANALYST", "VIEWER"])
    assert.equal(
      (
        await write(
          accounts.get(role),
          "POST",
          `/api/v1/data-sources/${source.id}/sync`,
          {},
        )
      ).status(),
      403,
    );
  const queued = await write(
    admin,
    "POST",
    `/api/v1/data-sources/${source.id}/sync`,
    {},
  );
  assert.equal(queued.status(), 202);
  const run = await queued.json();
  await until(async () => {
    const runs = await (await admin.get("/api/v1/sync-runs")).json();
    const current = runs.find((item) => item.id === run.id);
    assert.notEqual(
      current?.status,
      "FAILED",
      "Synchronization must complete successfully",
    );
    return current?.status === "COMPLETED";
  });
  const refreshed = await (
    await admin.get(`/api/v1/data-sources/${source.id}`)
  ).json();
  assert.equal(
    refreshed._count.orders,
    source._count.orders,
    "Replay must not duplicate seeded orders",
  );
  console.log(
    "PASS: Real BullMQ synchronization, checkpoint and idempotent persistence",
  );

  const analyst = accounts.get("ANALYST");
  const state = await analyst.storageState();
  const csv = await analyst.post("/api/v1/imports/csv", {
    headers: {
      Origin: origin,
      "X-CSRF-Token":
        state.cookies.find((cookie) => cookie.name === "prism_csrf")?.value ||
        "",
    },
    multipart: {
      file: {
        name: "compose-smoke.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(
          "date,campaign,channel,spend,clicks,impressions\n2026-10-01,Compose smoke,Email,12.34,2,20\n2026-02-30,Invalid,Email,1,0,0",
        ),
      },
    },
  });
  assert([200, 202].includes(csv.status()));
  const batch = await csv.json();
  await until(async () => {
    const current = await (
      await analyst.get(`/api/v1/imports/${batch.id}`)
    ).json();
    assert.notEqual(current.status, "FAILED");
    if (current.status !== "PARTIAL") return false;
    assert.equal(current.imported, 1);
    assert.equal(current.rejected, 1);
    return true;
  });
  console.log(
    "PASS: Analyst CSV import, asynchronous persistence and row-level errors",
  );

  const created = await write(analyst, "POST", "/api/v1/reports", {
    name: "Compose smoke report",
    metric: "revenue",
    group: "day",
    from: "2026-10-01",
    to: "2026-10-20",
  });
  assert.equal(created.status(), 201);
  const report = await created.json();
  try {
    const preview = await write(
      analyst,
      "POST",
      `/api/v1/reports/${report.id}/preview`,
      {},
    );
    assert.equal(preview.status(), 200);
    assert((await preview.json()).summary.revenue.value > 0);
    const exported = await analyst.get(`/api/v1/reports/${report.id}/export`);
    assert.equal(exported.status(), 200);
    assert((await exported.text()).includes("USD cents"));
    assert.equal(
      (
        await accounts.get("VIEWER").get(`/api/v1/reports/${report.id}/export`)
      ).status(),
      403,
    );
  } finally {
    assert.equal(
      (await write(analyst, "DELETE", `/api/v1/reports/${report.id}`)).status(),
      204,
    );
  }
  console.log(
    "PASS: Persisted analytics, report creation/preview/export/deletion and Viewer restrictions",
  );
  console.log("Workspace smoke verification passed.");
} finally {
  await Promise.all(contexts.map((context) => context.dispose()));
}
