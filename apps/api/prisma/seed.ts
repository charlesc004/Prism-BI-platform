import argon2 from "argon2";
import { db } from "../src/config/database.js";
import { env } from "../src/config/env.js";
import { GeneratedProvider } from "../src/providers/generated/provider.js";
import { ingestPage } from "../src/modules/ingestion/persist.js";
import type { Role } from "@prism/contracts";
if (env.NODE_ENV === "production" || !env.SEED_PASSWORD)
  throw new Error(
    "Seeding requires development/test and an explicit SEED_PASSWORD",
  );
const workspace = await db.workspace.upsert({
  where: { id: "northstar" },
  create: {
    id: "northstar",
    name: "Northstar Goods",
    timezone: "America/New_York",
  },
  update: {},
});
for (const role of ["ADMIN", "ANALYST", "VIEWER"] as Role[]) {
  const email = `${role.toLowerCase()}@prism.local`;
  const user = await db.user.upsert({
    where: { email },
    create: {
      email,
      name:
        role === "ADMIN"
          ? "Alex Morgan"
          : role === "ANALYST"
            ? "Jamie Chen"
            : "Sam Rivera",
      passwordHash: await argon2.hash(env.SEED_PASSWORD),
    },
    update: {},
  });
  await db.workspaceMembership.upsert({
    where: {
      userId_workspaceId: { userId: user.id, workspaceId: workspace.id },
    },
    create: { userId: user.id, workspaceId: workspace.id, role },
    update: {},
  });
}
for (const provider of ["SHOPIFY", "STRIPE", "CSV"]) {
  const source = await db.dataSourceConnection.upsert({
    where: {
      workspaceId_provider_mode: {
        workspaceId: workspace.id,
        provider,
        mode: "GENERATED",
      },
    },
    create: {
      workspaceId: workspace.id,
      provider,
      mode: "GENERATED",
      name:
        provider === "SHOPIFY"
          ? "Shopify Store"
          : provider === "STRIPE"
            ? "Stripe Payments"
            : "Marketing Campaigns",
    },
    update: {},
  });
  const adapter = new GeneratedProvider(provider);
  let cursor: string | undefined,
    checkpoint: string | undefined,
    total = 0;
  do {
    const page = await adapter.fetchPage({ cursor });
    const counts = await ingestPage(source, page.records);
    total += counts.created;
    cursor = page.nextCursor;
    checkpoint = page.checkpoint;
  } while (cursor);
  await db.dataSourceConnection.update({
    where: { id: source.id },
    data: { status: "READY", lastSuccess: new Date(), cursor: checkpoint },
  });
  if (!(await db.syncRun.count({ where: { sourceId: source.id } }))) {
    await db.syncRun.create({
      data: {
        sourceId: source.id,
        status: "COMPLETED",
        processed: total,
        created: total,
        attempt: 1,
        completedAt: new Date(),
        startedAt: new Date(Date.now() - 18000),
      },
    });
    await db.syncRun.create({
      data: {
        sourceId: source.id,
        status: "FAILED",
        attempt: 3,
        error:
          "Historical generated: provider rate limit exhausted. A later run recovered.",
        queuedAt: new Date(Date.now() - 3 * 86400000),
        completedAt: new Date(Date.now() - 3 * 86400000 + 6000),
      },
    });
  }
}
for (const provider of ["SHOPIFY", "STRIPE", "CSV"]) {
  const configured =
    provider === "CSV" ||
    (provider === "SHOPIFY" && !!env.SHOPIFY_TOKEN && !!env.SHOPIFY_DOMAIN) ||
    (provider === "STRIPE" && !!env.STRIPE_SECRET_KEY?.startsWith("sk_test_"));
  await db.dataSourceConnection.upsert({
    where: {
      workspaceId_provider_mode: {
        workspaceId: workspace.id,
        provider,
        mode: "LIVE",
      },
    },
    create: {
      workspaceId: workspace.id,
      provider,
      mode: "LIVE",
      name:
        provider === "CSV"
          ? "CSV File Uploads"
          : `${provider === "SHOPIFY" ? "Shopify" : "Stripe"} · Test connection`,
      status: configured ? "READY" : "NOT_CONFIGURED",
    },
    update: { status: configured ? "READY" : "NOT_CONFIGURED" },
  });
}
const owner = await db.user.findUniqueOrThrow({
  where: { email: "admin@prism.local" },
});
if (!(await db.savedReport.count({ where: { workspaceId: workspace.id } })))
  await db.savedReport.create({
    data: {
      workspaceId: workspace.id,
      ownerId: owner.id,
      name: "Monthly revenue overview",
      definition: {
        name: "Monthly revenue overview",
        metric: "revenue",
        group: "month",
        from: new Date(
          new Date(env.SEED_REFERENCE_DATE).getTime() - 364 * 86400000,
        )
          .toISOString()
          .slice(0, 10),
        to: env.SEED_REFERENCE_DATE,
      },
    },
  });
console.log("Seeded Northstar Goods with 395 days of deterministic data.");
await db.$disconnect();
