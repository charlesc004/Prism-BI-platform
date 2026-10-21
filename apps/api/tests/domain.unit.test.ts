import { describe, it, expect, afterAll } from "vitest";
import { parseRedisConnection } from "../src/config/redis-options.js";
import {
  calculateMetrics,
  reportingRange,
  analyticsCacheKey,
} from "../src/modules/analytics/service.js";
import { periodChange } from "@prism/contracts";
import { minorUnits, recordSchema } from "../src/providers/contracts.js";
import { parseCampaignCsv } from "../src/providers/csv/parser.js";
import { toCsv } from "../src/modules/exports/csv.js";
import {
  GeneratedProvider,
  generatedRecords,
} from "../src/providers/generated/provider.js";
import { db } from "../src/config/database.js";
import { redis } from "../src/config/redis.js";
afterAll(async () => {
  await db.$disconnect();
  redis.disconnect();
});

describe("Redis connection settings", () => {
  it("decodes credentials consistently for queue clients and preserves TLS/database settings", () => {
    expect(
      parseRedisConnection(
        "rediss://alice%40example:secret%23value@localhost:6380/2",
      ),
    ).toEqual({
      host: "localhost",
      port: 6380,
      username: "alice@example",
      password: "secret#value",
      db: 2,
      tls: {},
    });
    expect(parseRedisConnection("redis://localhost").db).toBe(0);
    expect(() =>
      parseRedisConnection("redis://localhost/not-a-database"),
    ).toThrow();
    expect(() => parseRedisConnection("redis://localhost:0/0")).toThrow();
  });
});
describe("financial definitions", () => {
  it("does not double count corresponding order and payment", () => {
    const order = { gross: 10000, discount: 1000, refund: 2000, count: 2 };
    expect(
      calculateMetrics(order, { gross: 9000, refund: 2000 }, 3500, "SHOPIFY"),
    ).toEqual({
      revenue: 7000,
      orders: 2,
      aov: 3500,
      refunds: 2000,
      spend: 3500,
      ratio: 2,
    });
    expect(
      calculateMetrics(order, { gross: 12000, refund: 1000 }, 3500, "STRIPE")
        .revenue,
    ).toBe(11000);
  });
  it("preserves missing data and zero denominators", () => {
    expect(calculateMetrics(null, null, null, "SHOPIFY").revenue).toBeNull();
    expect(
      calculateMetrics(
        { gross: 0, discount: 0, refund: 0, count: 0 },
        null,
        0,
        "SHOPIFY",
      ).ratio,
    ).toBeNull();
    expect(periodChange(100, 0)).toBeNull();
    expect(periodChange(120, 100)).toBe(20);
  });
  it("parses exact USD minor units and rejects unsupported precision/currency", () => {
    expect(minorUnits("12.03")).toBe(1203);
    expect(minorUnits("0.1")).toBe(10);
    expect(() => minorUnits("1.234")).toThrow();
    expect(() => minorUnits("-1")).toThrow();
    expect(
      recordSchema.safeParse({
        kind: "payment",
        externalId: "p",
        occurredAt: new Date(),
        currency: "EUR",
        amount: 100,
        refund: 0,
        status: "SUCCEEDED",
      }).success,
    ).toBe(false);
  });
});
describe("reporting boundaries and caching", () => {
  it("uses half-open calendar days across DST", () => {
    const range = reportingRange(
      { from: "2026-03-08", to: "2026-03-08", group: "day" },
      "America/New_York",
    );
    expect(range.to.toMillis() - range.from.toMillis()).toBe(23 * 3600000);
    expect(() =>
      reportingRange(
        { from: "2026-01-02", to: "2026-01-01", group: "day" },
        "UTC",
      ),
    ).toThrow();
  });
  it("separates workspace, version and filter cache keys", () => {
    const f = { from: "2026-01-01", to: "2026-01-02", group: "day" as const };
    expect(analyticsCacheKey("a", "1", f)).not.toBe(
      analyticsCacheKey("b", "1", f),
    );
    expect(analyticsCacheKey("a", "1", f)).not.toBe(
      analyticsCacheKey("a", "2", f),
    );
  });
});
describe("CSV safety and validation", () => {
  it("rejects blank and out-of-range counts while accepting an explicit zero", () => {
    const parsed = parseCampaignCsv(
      "date,campaign,channel,spend,clicks,impressions\n2026-10-01,Blank,Email,1.00,,10\n2026-10-01,Large,Email,1.00,9999999999,10\n2026-10-01,Zero,Email,1.00,0,0",
    );
    expect(parsed.records).toHaveLength(1);
    expect(parsed.errors.map((error) => error.row)).toEqual([2, 3]);
    expect(parsed.records[0]).toMatchObject({ clicks: 0, impressions: 0 });
  });
  it("reports row-level errors and duplicates", () => {
    const parsed = parseCampaignCsv(
      "date,campaign,channel,spend,clicks,impressions\n2026-09-01,Launch,Google Ads,12.03,5,100\n2026-09-01,Launch,Google Ads,12.03,5,100\n2026-02-30,Bad,Email,1.00,0,0\n2026-09-02,Bad,Email,-1,0,0",
    );
    expect(parsed.records).toHaveLength(1);
    expect(parsed.errors.map((e) => e.row)).toEqual([3, 4, 5]);
    expect(parsed.records[0]).toMatchObject({ spend: 1203 });
  });
  it("rejects malformed files and escapes formula injection", () => {
    expect(() => parseCampaignCsv("hello,world\n1,2")).toThrow();
    expect(toCsv([{ name: "=SUM(A1)", note: 'a,"b"\nc' }])).toContain(
      '"\'=SUM(A1)"',
    );
    expect(toCsv([{ name: " \t+cmd" }])).toContain("' \t+cmd");
  });
});
describe("generated providers", () => {
  it("generates deterministic corresponding records", () => {
    const orders = generatedRecords("SHOPIFY", "2026-10-20"),
      payments = generatedRecords("STRIPE", "2026-10-20");
    expect(orders.length).toBeGreaterThan(300);
    expect(payments.length).toBe(orders.length);
    expect(orders).toEqual(generatedRecords("SHOPIFY", "2026-10-20"));
  });
  it("paginates and incrementally replays only recent records", async () => {
    const provider = new GeneratedProvider("SHOPIFY"),
      first = await provider.fetchPage({});
    expect(first.records.length).toBe(100);
    expect(first.nextCursor).toBe("100");
    const second = await provider.fetchPage({ cursor: first.nextCursor });
    expect(second.records[0].externalId).not.toBe(first.records[0].externalId);
    const recent = await provider.fetchPage({ since: "2026-10-20T00:00:00Z" });
    expect(recent.records.length).toBeLessThan(100);
  });
});
