import { DateTime } from "luxon";
import { Prisma } from "../../generated/prisma/client.js";
import { db } from "../../config/database.js";
import { redis } from "../../config/redis.js";
import { AppError } from "../../shared/errors.js";
import {
  periodChange,
  type AnalyticsFilter,
  type AnalyticsResult,
  type Metric,
  type TrendPoint,
} from "@prism/contracts";

export function reportingRange(filter: AnalyticsFilter, timezone: string) {
  const to = filter.to
    ? DateTime.fromISO(filter.to, { zone: timezone })
        .plus({ days: 1 })
        .startOf("day")
    : DateTime.now().setZone(timezone).plus({ days: 1 }).startOf("day");
  const from = filter.from
    ? DateTime.fromISO(filter.from, { zone: timezone }).startOf("day")
    : to.minus({ days: 30 });
  if (
    !from.isValid ||
    !to.isValid ||
    from >= to ||
    to.diff(from, "days").days > 400
  )
    throw new AppError(
      400,
      "Choose a valid reporting period of at most 400 days",
    );
  return { from, to };
}
type Daily = {
  day: string;
  gross: bigint;
  discount: bigint;
  refund: bigint;
  count: bigint;
};
type Spend = { day: string; spend: bigint };
export function calculateMetrics(
  order: {
    gross: number;
    discount: number;
    refund: number;
    count: number;
  } | null,
  payment: { gross: number; refund: number } | null,
  spend: number | null,
  canonical: string,
) {
  const base = canonical === "SHOPIFY" ? order : payment;
  const revenue = base
    ? base.gross -
      (canonical === "SHOPIFY" ? (order?.discount ?? 0) : 0) -
      base.refund
    : null;
  return {
    revenue,
    orders: order?.count ?? null,
    aov:
      order && order.count
        ? Math.round(
            (order.gross - order.discount - order.refund) / order.count,
          )
        : null,
    refunds: base?.refund ?? null,
    spend,
    ratio:
      revenue !== null && spend
        ? Math.round((revenue / spend) * 100) / 100
        : null,
  };
}
export function analyticsCacheKey(
  workspaceId: string,
  version: string,
  filter: AnalyticsFilter,
) {
  return `analytics:${workspaceId}:${version}:${JSON.stringify([filter.from, filter.to, filter.group, filter.sourceId])}`;
}
export async function invalidateAnalytics(workspaceId: string) {
  try {
    await redis.incr(`analytics-version:${workspaceId}`);
  } catch {
    /* Reads use TTL if cache infrastructure is unavailable. */
  }
}
export async function analytics(
  workspaceId: string,
  filter: AnalyticsFilter,
): Promise<AnalyticsResult> {
  const workspace = await db.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
  });
  const { from, to } = reportingRange(filter, workspace.timezone);
  const normalized = {
    ...filter,
    from: from.toISODate()!,
    to: to.minus({ days: 1 }).toISODate()!,
  };
  let cacheKey = "";
  try {
    cacheKey = analyticsCacheKey(
      workspaceId,
      (await redis.get(`analytics-version:${workspaceId}`)) || "0",
      normalized,
    );
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as AnalyticsResult;
  } catch {
    /* PostgreSQL remains authoritative. */
  }
  const allSources = await db.dataSourceConnection.findMany({
    where: { workspaceId, ...(filter.sourceId ? { id: filter.sourceId } : {}) },
  });
  if (filter.sourceId && !allSources.length)
    throw new AppError(404, "Source not found");
  // A successfully imported live commerce connection replaces its generated counterpart.
  // File uploads augment campaign spend; separate source filters remain available.
  const sources = allSources.filter(
    (source) =>
      filter.sourceId ||
      source.provider === "CSV" ||
      source.mode === "LIVE" ||
      !allSources.some(
        (other) =>
          other.provider === source.provider &&
          other.mode === "LIVE" &&
          other.lastSuccess,
      ),
  );
  const sourceIds = sources.map((source) => source.id);
  const sourceClause = sourceIds.length
    ? Prisma.sql`AND "sourceId" IN (${Prisma.join(sourceIds)})`
    : Prisma.sql`AND false`;
  const start = from.minus({ days: Math.round(to.diff(from, "days").days) });
  const bounds = Prisma.sql`"workspaceId"=${workspaceId} AND currency=${workspace.currency} AND "occurredAt">=${start.toJSDate()} AND "occurredAt"<${to.toJSDate()} ${sourceClause}`;
  const [orders, payments, spends, channels] = await Promise.all([
    db.$queryRaw<Daily[]>(
      Prisma.sql`SELECT to_char("occurredAt" AT TIME ZONE ${workspace.timezone},'YYYY-MM-DD') AS day, SUM(gross)::bigint AS gross,SUM(discount)::bigint AS discount,SUM(refund)::bigint AS refund,COUNT(*)::bigint AS count FROM "CommerceOrder" WHERE ${bounds} AND status='PAID' GROUP BY day ORDER BY day`,
    ),
    db.$queryRaw<Daily[]>(
      Prisma.sql`SELECT to_char("occurredAt" AT TIME ZONE ${workspace.timezone},'YYYY-MM-DD') AS day,SUM(amount)::bigint AS gross,0::bigint AS discount,SUM(refund)::bigint AS refund,COUNT(*)::bigint AS count FROM "PaymentRecord" WHERE ${bounds} AND status='SUCCEEDED' GROUP BY day ORDER BY day`,
    ),
    db.$queryRaw<Spend[]>(
      Prisma.sql`SELECT to_char("occurredAt" AT TIME ZONE ${workspace.timezone},'YYYY-MM-DD') AS day,SUM(spend)::bigint AS spend FROM "CampaignSpend" WHERE ${bounds} GROUP BY day ORDER BY day`,
    ),
    db.campaignSpend.groupBy({
      by: ["channel"],
      where: {
        workspaceId,
        currency: workspace.currency,
        occurredAt: { gte: from.toJSDate(), lt: to.toJSDate() },
        sourceId: { in: sourceIds },
      },
      _sum: { spend: true },
    }),
  ]);
  const orderAvailable = sources.some(
      (s) => s.provider === "SHOPIFY" && s.lastSuccess,
    ),
    paymentAvailable = sources.some(
      (s) => s.provider === "STRIPE" && s.lastSuccess,
    ),
    spendAvailable = sources.some((s) => s.provider === "CSV" && s.lastSuccess);
  const sum = (rows: Daily[], a: string, b: string) =>
    rows
      .filter((r) => r.day >= a && r.day < b)
      .reduce(
        (s, r) => ({
          gross: s.gross + Number(r.gross),
          discount: s.discount + Number(r.discount),
          refund: s.refund + Number(r.refund),
          count: s.count + Number(r.count),
        }),
        { gross: 0, discount: 0, refund: 0, count: 0 },
      );
  const values = (a: string, b: string) =>
    calculateMetrics(
      orderAvailable ? sum(orders, a, b) : null,
      paymentAvailable ? sum(payments, a, b) : null,
      spendAvailable
        ? spends
            .filter((r) => r.day >= a && r.day < b)
            .reduce((s, r) => s + Number(r.spend), 0)
        : null,
      workspace.canonical,
    );
  const current = values(from.toISODate()!, to.toISODate()!),
    previous = values(start.toISODate()!, from.toISODate()!);
  const summary = Object.fromEntries(
    Object.keys(current).map((key) => {
      const k = key as Metric;
      return [
        k,
        {
          value: current[k],
          previous: previous[k],
          change: periodChange(current[k], previous[k]),
        },
      ];
    }),
  ) as AnalyticsResult["summary"];
  const trends: TrendPoint[] = [];
  let day = from;
  while (day < to) {
    let next =
      filter.group === "month"
        ? day.plus({ months: 1 }).startOf("month")
        : filter.group === "week"
          ? day.plus({ weeks: 1 }).startOf("week")
          : day.plus({ days: 1 });
    if (next > to) next = to;
    trends.push({
      date: day.toISODate()!,
      ...values(day.toISODate()!, next.toISODate()!),
      payments: paymentAvailable
        ? sum(payments, day.toISODate()!, next.toISODate()!).gross
        : null,
    });
    day = next;
  }
  const last =
    sources
      .map((s) => s.lastSuccess?.toISOString())
      .filter((s): s is string => !!s)
      .sort()
      .at(0) || null;
  const result: AnalyticsResult = {
    summary,
    trends,
    channels: channels.map((c) => ({
      channel: c.channel,
      spend: c._sum.spend || 0,
    })),
    period: {
      from: from.toISODate()!,
      to: to.minus({ days: 1 }).toISODate()!,
      timezone: workspace.timezone,
      canonical: workspace.canonical,
    },
    currency: workspace.currency,
    updatedAt: last,
    warnings: sources
      .filter(
        (s) =>
          s.lastSuccess &&
          (s.status === "ERROR" ||
            Date.now() - s.lastSuccess.getTime() > 86400000),
      )
      .map(
        (s) =>
          `${s.name}: ${s.status === "ERROR" ? "the last synchronization failed; showing previously committed records" : "data has not refreshed for over 24 hours"}.`,
      ),
  };
  try {
    if (cacheKey) await redis.set(cacheKey, JSON.stringify(result), "EX", 60);
  } catch {
    /* Cache failure does not hide persisted analytics. */
  }
  return result;
}
