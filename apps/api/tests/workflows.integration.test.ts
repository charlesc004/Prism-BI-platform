import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import request from "supertest";
import argon2 from "argon2";
import { Worker } from "bullmq";
import { app } from "../src/app.js";
import { db } from "../src/config/database.js";
import { redis, queueConnection } from "../src/config/redis.js";
import { syncQueue } from "../src/jobs/queues.js";
import { processJob } from "../src/jobs/processor.js";
import * as registry from "../src/providers/registry.js";
import { requestSync } from "../src/modules/synchronization/service.js";
import { GeneratedProvider } from "../src/providers/generated/provider.js";
import { ingestPage } from "../src/modules/ingestion/persist.js";
import { invalidateAnalytics } from "../src/modules/analytics/service.js";
const password = "Integration2026!",
  workspaceId = "integration-workspace";
const admin = request.agent(app),
  analyst = request.agent(app),
  viewer = request.agent(app);
let csrf = "",
  viewerCsrf = "",
  analystCsrf = "",
  sourceId = "",
  csvId = "",
  foreignId = "";
let worker: Worker;
async function waitUntil(check: () => Promise<boolean>) {
  for (let i = 0; i < 200; i++) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("Timed out waiting for ingestion");
}
beforeAll(async () => {
  if (
    !process.env.DATABASE_URL?.includes("prism_test") &&
    !process.env.ALLOW_TEST_DATABASE
  )
    throw new Error("Tests require an isolated prism_test database");
  await db.workspace.deleteMany({
    where: { id: { in: [workspaceId, "foreign-test"] } },
  });
  await db.user.deleteMany({
    where: { email: { endsWith: "@integration.test" } },
  });
  await syncQueue.obliterate({ force: true });
  await db.workspace.create({
    data: { id: workspaceId, name: "Integration Workspace" },
  });
  await db.workspace.create({
    data: { id: "foreign-test", name: "Other business" },
  });
  for (const role of ["ADMIN", "ANALYST", "VIEWER"] as const)
    await db.user.create({
      data: {
        name: role,
        email: role.toLowerCase() + "@integration.test",
        passwordHash: await argon2.hash(password),
        members: { create: { workspaceId, role } },
      },
    });
  sourceId = (
    await db.dataSourceConnection.create({
      data: {
        workspaceId,
        provider: "SHOPIFY",
        name: "Test Shopify",
        mode: "GENERATED",
      },
    })
  ).id;
  csvId = (
    await db.dataSourceConnection.create({
      data: { workspaceId, provider: "CSV", name: "CSV", mode: "LIVE" },
    })
  ).id;
  foreignId = (
    await db.dataSourceConnection.create({
      data: {
        workspaceId: "foreign-test",
        provider: "STRIPE",
        name: "Foreign",
      },
    })
  ).id;
  worker = new Worker("prism-ingestion", processJob, {
    connection: queueConnection,
    concurrency: 1,
  });
  worker.on("failed", (job, error) =>
    console.error("Test worker failed", job?.id, error.message),
  );
  worker.on("error", (error) =>
    console.error("Test worker error", error.message),
  );
  const a = await admin
    .post("/api/v1/auth/login")
    .send({ email: "admin@integration.test", password });
  csrf = String(a.headers["set-cookie"]).match(/prism_csrf=([^;]+)/)?.[1] || "";
  const v = await viewer
    .post("/api/v1/auth/login")
    .send({ email: "viewer@integration.test", password });
  viewerCsrf =
    String(v.headers["set-cookie"]).match(/prism_csrf=([^;]+)/)?.[1] || "";
  const a2 = await analyst
    .post("/api/v1/auth/login")
    .send({ email: "analyst@integration.test", password });
  analystCsrf =
    String(a2.headers["set-cookie"]).match(/prism_csrf=([^;]+)/)?.[1] || "";
});
afterAll(async () => {
  await worker?.close();
  await syncQueue.close();
  await redis.quit();
  await db.workspace.deleteMany({
    where: { id: { in: [workspaceId, "foreign-test"] } },
  });
  await db.user.deleteMany({
    where: { email: { endsWith: "@integration.test" } },
  });
  await db.$disconnect();
});
describe.sequential("authenticated persisted workflows", () => {
  it("retains a queued upload on Redis failure and resumes the same file safely", async () => {
    const payload = Buffer.from(
      "date,campaign,channel,spend,clicks,impressions\n2026-10-01,Queue recovery,Email,10.00,1,10",
    );
    const enqueue = vi
      .spyOn(syncQueue, "add")
      .mockRejectedValueOnce(new Error("Synthetic Redis outage"));
    try {
      const failed = await admin
        .post("/api/v1/imports/csv")
        .set("X-CSRF-Token", csrf)
        .attach("file", payload, "recovery.csv");
      expect(failed.status).toBe(503);
    } finally {
      enqueue.mockRestore();
    }
    const pending = await db.importBatch.findFirstOrThrow({
      where: { workspaceId, filename: "recovery.csv" },
    });
    expect(pending.status).toBe("QUEUED");
    expect(pending.payload).toBeTruthy();
    const before = await db.dataSourceConnection.findUniqueOrThrow({
      where: { id: csvId },
    });
    const retried = await admin
      .post("/api/v1/imports/csv")
      .set("X-CSRF-Token", csrf)
      .attach("file", payload, "recovery.csv");
    expect(retried.status).toBe(202);
    expect(retried.body.id).toBe(pending.id);
    await waitUntil(
      async () =>
        (await db.importBatch.findUniqueOrThrow({ where: { id: pending.id } }))
          .status === "COMPLETED",
    );
    await db.campaignSpend.deleteMany({
      where: { sourceId: csvId, campaign: "Queue recovery" },
    });
    await db.importBatch.delete({ where: { id: pending.id } });
    await db.dataSourceConnection.update({
      where: { id: csvId },
      data: { lastSuccess: before.lastSuccess, status: before.status },
    });
    await invalidateAnalytics(workspaceId);
  });
  it("enforces a distinct server-side permission matrix for all three roles", async () => {
    for (const [agent, token, role] of [
      [admin, csrf, "ADMIN"],
      [analyst, analystCsrf, "ANALYST"],
      [viewer, viewerCsrf, "VIEWER"],
    ] as const) {
      expect((await agent.get("/api/v1/auth/me")).body.role).toBe(role);
      expect((await agent.get("/api/v1/data-sources")).status).toBe(200);
      expect((await agent.get("/api/v1/settings/team")).status).toBe(
        role === "ADMIN" ? 200 : 403,
      );
      expect((await agent.get("/api/v1/audit")).status).toBe(
        role === "ADMIN" ? 200 : 403,
      );
      expect((await agent.get("/api/v1/data/orders/export")).status).toBe(
        role === "VIEWER" ? 403 : 200,
      );
      expect(
        (
          await agent
            .post("/api/v1/data-sources/" + foreignId + "/sync")
            .set("X-CSRF-Token", token)
        ).status,
      ).toBe(role === "ADMIN" ? 404 : 403);
      expect(
        (
          await agent
            .patch("/api/v1/settings/workspace")
            .set("X-CSRF-Token", token)
            .send({})
        ).status,
      ).toBe(role === "ADMIN" ? 400 : 403);
      expect(
        (await agent.post("/api/v1/imports/csv").set("X-CSRF-Token", token))
          .status,
      ).toBe(role === "VIEWER" ? 403 : 400);
      expect(
        (
          await agent
            .post("/api/v1/report-preview")
            .set("X-CSRF-Token", token)
            .send({
              name: "Role preview",
              metric: "revenue",
              group: "day",
              from: "2026-09-01",
              to: "2026-09-30",
            })
        ).status,
      ).toBe(role === "VIEWER" ? 403 : 200);
    }
  });
  it("consumes a refresh token once when two requests race", async () => {
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "admin@integration.test", password });
    const rawCookies = login.headers["set-cookie"];
    const cookie = (
      Array.isArray(rawCookies) ? rawCookies : [String(rawCookies)]
    )
      .map((value) => value.split(";")[0])
      .join("; ");
    const token = cookie.match(/prism_csrf=([^;]+)/)?.[1] || "";
    const rotate = () =>
      request(app)
        .post("/api/v1/auth/refresh")
        .set("Cookie", cookie)
        .set("X-CSRF-Token", token);
    const responses = await Promise.all([rotate(), rotate()]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 401,
    ]);
  });
  it("returns structured client errors for malformed and oversized JSON", async () => {
    const malformed = await admin
      .post("/api/v1/reports")
      .set("Content-Type", "application/json")
      .send('{"name":');
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.message).toContain("valid JSON");
    expect(malformed.body.error.requestId).toBeTruthy();
    const large = await admin
      .post("/api/v1/reports")
      .send({ name: "x".repeat(110000) });
    expect(large.status).toBe(413);
    const invalidCsrf = await admin
      .post("/api/v1/reports")
      .set("X-CSRF-Token", "é".repeat(64))
      .send({});
    expect(invalidCsrf.status).toBe(403);
  });
  it("reads, updates and removes schedules while enforcing workspace and source rules", async () => {
    const path = "/api/v1/data-sources/" + sourceId + "/schedule";
    expect((await admin.get(path)).body.schedule).toBe("off");
    expect((await viewer.get(path)).status).toBe(403);
    expect(
      (await admin.get("/api/v1/data-sources/" + foreignId + "/schedule"))
        .status,
    ).toBe(404);
    try {
      const saved = await admin
        .patch(path)
        .set("X-CSRF-Token", csrf)
        .send({ schedule: "hourly" });
      expect(saved.status).toBe(200);
      expect((await admin.get(path)).body.schedule).toBe("hourly");
      const invalid = await admin
        .patch("/api/v1/data-sources/" + csvId + "/schedule")
        .set("X-CSRF-Token", csrf)
        .send({ schedule: "daily" });
      expect(invalid.status).toBe(400);
    } finally {
      await admin
        .patch(path)
        .set("X-CSRF-Token", csrf)
        .send({ schedule: "off" });
    }
    expect((await admin.get(path)).body.schedule).toBe("off");
    await waitUntil(
      async () =>
        !!(await db.syncRun.findFirst({
          where: { sourceId, status: "COMPLETED" },
        })),
    );
    await db.commerceOrder.deleteMany({ where: { sourceId } });
    await db.dataSourceConnection.update({
      where: { id: sourceId },
      data: { cursor: null, lastSuccess: null, status: "READY" },
    });
    await invalidateAnalytics(workspaceId);
  });
  it("accepts simultaneous identical uploads without duplicate import batches", async () => {
    const before = await db.dataSourceConnection.findUniqueOrThrow({
      where: { id: csvId },
    });
    const content = Buffer.from(
      "date,campaign,channel,spend,clicks,impressions\n2026-10-01,Concurrent upload,Email,12.34,2,20",
    );
    const upload = () =>
      admin
        .post("/api/v1/imports/csv")
        .set("X-CSRF-Token", csrf)
        .attach("file", content, "concurrent.csv");
    const responses = await Promise.all([upload(), upload()]);
    for (const response of responses)
      expect([200, 202]).toContain(response.status);
    expect(responses[0].body.id).toBe(responses[1].body.id);
    await waitUntil(
      async () =>
        (
          await db.importBatch.findUniqueOrThrow({
            where: { id: responses[0].body.id },
          })
        ).status === "COMPLETED",
    );
    expect(
      await db.importBatch.count({
        where: { workspaceId, filename: "concurrent.csv" },
      }),
    ).toBe(1);
    await db.campaignSpend.deleteMany({
      where: { sourceId: csvId, campaign: "Concurrent upload" },
    });
    await db.importBatch.deleteMany({
      where: { workspaceId, filename: "concurrent.csv" },
    });
    await db.dataSourceConnection.update({
      where: { id: csvId },
      data: { lastSuccess: before.lastSuccess, status: before.status },
    });
    await invalidateAnalytics(workspaceId);
  });
  it("retries a partial page without advancing the checkpoint or duplicating data", async () => {
    const before = await db.commerceOrder.count({ where: { sourceId } });
    const originalCursor = (
      await db.dataSourceConnection.findUniqueOrThrow({
        where: { id: sourceId },
      })
    ).cursor;
    let interrupted = false;
    const record = {
      kind: "order" as const,
      externalId: "retry-first",
      occurredAt: new Date("2026-10-19T12:00:00Z"),
      currency: "USD" as const,
      gross: 12000,
      discount: 0,
      refund: 0,
      status: "PAID" as const,
    };
    const adapter = vi.spyOn(registry, "getProvider").mockReturnValue({
      fetchPage: async ({ cursor }) => {
        if (!cursor) return { records: [record], nextCursor: "second" };
        if (!interrupted) {
          interrupted = true;
          expect(
            (
              await db.dataSourceConnection.findUniqueOrThrow({
                where: { id: sourceId },
              })
            ).cursor,
          ).toBe(originalCursor);
          throw new Error(
            "Synthetic provider outage after first committed page",
          );
        }
        return {
          records: [{ ...record, externalId: "retry-second" }],
          checkpoint: "2026-10-20T00:00:00.000Z",
        };
      },
    });
    try {
      const run = await requestSync(sourceId, workspaceId, "test");
      await waitUntil(
        async () =>
          (await db.syncRun.findUniqueOrThrow({ where: { id: run.id } }))
            .status === "COMPLETED",
      );
      expect(
        (await db.syncRun.findUniqueOrThrow({ where: { id: run.id } })).attempt,
      ).toBe(2);
      expect(await db.commerceOrder.count({ where: { sourceId } })).toBe(
        before + 2,
      );
    } finally {
      adapter.mockRestore();
    }
    // Restore the source so the next test can verify a full initial ingestion.
    await db.commerceOrder.deleteMany({ where: { sourceId } });
    await db.dataSourceConnection.update({
      where: { id: sourceId },
      data: { cursor: null, lastSuccess: null, status: "READY" },
    });
  });
  it("requires authentication, CSRF, roles and workspace ownership", async () => {
    expect((await request(app).get("/api/v1/data-sources")).status).toBe(401);
    expect(
      (await admin.post(`/api/v1/data-sources/${sourceId}/sync`)).status,
    ).toBe(403);
    expect(
      (
        await viewer
          .post(`/api/v1/data-sources/${sourceId}/sync`)
          .set("X-CSRF-Token", viewerCsrf)
      ).status,
    ).toBe(403);
    expect((await admin.get(`/api/v1/data-sources/${foreignId}`)).status).toBe(
      404,
    );
    expect((await viewer.get("/api/v1/settings/team")).status).toBe(403);
  });
  it("queues generated ingestion, commits records and advances the checkpoint", async () => {
    const response = await admin
      .post(`/api/v1/data-sources/${sourceId}/sync`)
      .set("X-CSRF-Token", csrf);
    expect(response.status).toBe(202);
    await waitUntil(
      async () =>
        (
          await db.syncRun.findUniqueOrThrow({
            where: { id: response.body.id },
          })
        ).status === "COMPLETED",
    );
    expect(
      await db.commerceOrder.count({ where: { sourceId } }),
    ).toBeGreaterThan(300);
    expect(
      (
        await db.dataSourceConnection.findUniqueOrThrow({
          where: { id: sourceId },
        })
      ).cursor,
    ).toBeTruthy();
  });
  it("prevents concurrent jobs and duplicate records, invalidates caches", async () => {
    const before = await db.commerceOrder.count({ where: { sourceId } }),
      version = await redis.get(`analytics-version:${workspaceId}`);
    const run = await requestSync(sourceId, workspaceId, "test");
    await expect(requestSync(sourceId, workspaceId, "test")).rejects.toThrow(
      "already active",
    );
    await waitUntil(
      async () =>
        (await db.syncRun.findUniqueOrThrow({ where: { id: run.id } }))
          .status === "COMPLETED",
    );
    expect(await db.commerceOrder.count({ where: { sourceId } })).toBe(before);
    expect(await redis.get(`analytics-version:${workspaceId}`)).not.toBe(
      version,
    );
  });
  it("upserts changed records rather than duplicating them", async () => {
    const page = await new GeneratedProvider("SHOPIFY").fetchPage({}),
      record = page.records[0];
    if (record.kind !== "order") throw new Error("Expected order");
    const before = await db.commerceOrder.count({ where: { sourceId } });
    await ingestPage({ id: sourceId, workspaceId }, [
      { ...record, refund: 123 },
    ]);
    expect(await db.commerceOrder.count({ where: { sourceId } })).toBe(before);
    expect(
      (
        await db.commerceOrder.findUniqueOrThrow({
          where: {
            sourceId_externalId: { sourceId, externalId: record.externalId },
          },
        })
      ).refund,
    ).toBe(123);
  });
  it("aggregates persisted data with bounded dates and currency", async () => {
    const response = await admin.get(
      "/api/v1/dashboard/summary?from=2026-09-01&to=2026-09-30",
    );
    expect(response.status).toBe(200);
    expect(response.body.summary.revenue.value).toBeGreaterThan(0);
    expect(response.body.summary.spend.value).toBeNull();
    expect(
      (
        await admin.get(
          "/api/v1/dashboard/summary?from=2020-01-01&to=2026-01-01",
        )
      ).status,
    ).toBe(400);
  });
  it("validates and processes a partial CSV, deduplicates repeat files", async () => {
    const csv =
      "date,campaign,channel,spend,clicks,impressions\n2026-09-01,Launch,Email,120.50,34,500\n2026-02-30,Bad,Email,1,1,1";
    const response = await admin
      .post("/api/v1/imports/csv")
      .set("X-CSRF-Token", csrf)
      .attach("file", Buffer.from(csv), "campaign.csv");
    expect(response.status).toBe(202);
    await waitUntil(
      async () =>
        (
          await db.importBatch.findUniqueOrThrow({
            where: { id: response.body.id },
          })
        ).status === "PARTIAL",
    );
    expect(await db.campaignSpend.count({ where: { sourceId: csvId } })).toBe(
      1,
    );
    const duplicate = await admin
      .post("/api/v1/imports/csv")
      .set("X-CSRF-Token", csrf)
      .attach("file", Buffer.from(csv), "campaign.csv");
    expect(duplicate.body.duplicate).toBe(true);
    expect(
      (
        await admin
          .post("/api/v1/imports/csv")
          .set("X-CSRF-Token", csrf)
          .attach("file", Buffer.from("wrong\nfile"), "bad.csv")
      ).status,
    ).toBe(400);
  });
  it("filters and paginates in the database, rejects unsafe sort keys", async () => {
    const result = await admin.get(
      "/api/v1/data/orders?from=2026-09-01&to=2026-09-30&pageSize=5&page=2",
    );
    expect(result.status).toBe(200);
    expect(result.body.data).toHaveLength(5);
    expect(result.body.total).toBeGreaterThan(5);
    expect(
      (await admin.get("/api/v1/data/orders?sort=passwordHash")).status,
    ).toBe(400);
  });
  it("saves, previews, edits and safely exports reports with audit records", async () => {
    const definition = {
      name: "Revenue test",
      metric: "revenue",
      group: "week",
      from: "2026-09-01",
      to: "2026-09-30",
    };
    const saved = await admin
      .post("/api/v1/reports")
      .set("X-CSRF-Token", csrf)
      .send(definition);
    expect(saved.status).toBe(201);
    expect(
      (
        await admin
          .post("/api/v1/reports/" + saved.body.id + "/preview")
          .set("X-CSRF-Token", csrf)
      ).body.trends.length,
    ).toBeGreaterThan(0);
    expect(
      (await admin.get("/api/v1/reports/" + saved.body.id + "/export")).text,
    ).toContain("USD cents");
    expect(
      (await viewer.get("/api/v1/reports/" + saved.body.id + "/export")).status,
    ).toBe(403);
    expect(
      (
        await admin
          .patch("/api/v1/reports/" + saved.body.id)
          .set("X-CSRF-Token", csrf)
          .send({ ...definition, name: "Updated" })
      ).status,
    ).toBe(200);
    expect(
      await db.auditLog.count({
        where: { workspaceId, action: "report.exported" },
      }),
    ).toBe(1);
    expect(
      (
        await admin
          .delete("/api/v1/reports/" + saved.body.id)
          .set("X-CSRF-Token", csrf)
      ).status,
    ).toBe(204);
  });
  it("records exhausted retries, preserves checkpoints and reports incomplete freshness", async () => {
    const before = await db.dataSourceConnection.findUniqueOrThrow({
      where: { id: sourceId },
    });
    const adapter = vi.spyOn(registry, "getProvider").mockReturnValue({
      fetchPage: async () => {
        throw new Error("Synthetic persistent outage");
      },
    });
    try {
      const run = await requestSync(sourceId, workspaceId, "test");
      await waitUntil(
        async () =>
          (await db.syncRun.findUniqueOrThrow({ where: { id: run.id } }))
            .status === "FAILED",
      );
      const failed = await db.syncRun.findUniqueOrThrow({
        where: { id: run.id },
      });
      expect(failed.attempt).toBe(3);
      expect(failed.error).toContain("Committed pages");
      const source = await db.dataSourceConnection.findUniqueOrThrow({
        where: { id: sourceId },
      });
      expect(source.status).toBe("ERROR");
      expect(source.cursor).toBe(before.cursor);
      expect(source.lastSuccess).toEqual(before.lastSuccess);
      const response = await admin.get(
        "/api/v1/dashboard/summary?from=2026-09-01&to=2026-09-30",
      );
      expect(response.body.warnings.join(" ")).toContain("failed");
    } finally {
      adapter.mockRestore();
    }
  });
  it("keeps a synchronization claimed when the enqueue acknowledgement is lost", async () => {
    const source = await db.dataSourceConnection.create({
      data: {
        workspaceId,
        name: "Lost queue acknowledgement",
        provider: "STRIPE",
        mode: "GENERATED",
      },
    });
    await worker.pause();
    const add = syncQueue.add.bind(syncQueue);
    const enqueue = vi
      .spyOn(syncQueue, "add")
      .mockImplementationOnce(async (...args) => {
        await add(...args);
        throw new Error("Acknowledgement lost after enqueue");
      });
    const adapter = vi.spyOn(registry, "getProvider").mockReturnValue({
      fetchPage: async () => ({ records: [], checkpoint: "recovered" }),
    });
    try {
      await expect(
        requestSync(source.id, workspaceId, "test"),
      ).rejects.toMatchObject({ status: 503 });
      const run = await db.syncRun.findFirstOrThrow({
        where: { sourceId: source.id },
      });
      expect(run.status).toBe("QUEUED");
      expect(await syncQueue.getJob(run.id)).toBeTruthy();
      await expect(
        requestSync(source.id, workspaceId, "test"),
      ).rejects.toMatchObject({ status: 409 });
      await worker.resume();
      await waitUntil(
        async () =>
          (await db.syncRun.findUniqueOrThrow({ where: { id: run.id } }))
            .status === "COMPLETED",
      );
      expect(
        (
          await db.dataSourceConnection.findUniqueOrThrow({
            where: { id: source.id },
          })
        ).cursor,
      ).toBe("recovered");
    } finally {
      enqueue.mockRestore();
      adapter.mockRestore();
      await worker.resume();
      await db.dataSourceConnection.delete({ where: { id: source.id } });
    }
  });
  it("rotates the refresh token and revokes logout sessions", async () => {
    const refreshed = await admin
      .post("/api/v1/auth/refresh")
      .set("X-CSRF-Token", csrf);
    expect(refreshed.status).toBe(200);
    csrf =
      String(refreshed.headers["set-cookie"]).match(
        /prism_csrf=([^;]+)/,
      )?.[1] || "";
    expect((await admin.get("/api/v1/auth/me")).status).toBe(200);
    expect(
      (await admin.post("/api/v1/auth/logout").set("X-CSRF-Token", csrf))
        .status,
    ).toBe(200);
    expect((await admin.get("/api/v1/auth/me")).status).toBe(401);
  });
});
