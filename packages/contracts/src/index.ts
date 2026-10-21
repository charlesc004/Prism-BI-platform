import { z } from "zod";

export const roles = ["ADMIN", "ANALYST", "VIEWER"] as const;
export type Role = (typeof roles)[number];
export const metrics = {
  revenue: {
    label: "Net revenue",
    unit: "currency",
    definition:
      "Canonical source: paid order gross − discounts − refunds, or successful payment amount − refunds. Excludes cancelled orders. No addition of orders and payments.",
  },
  orders: {
    label: "Orders",
    unit: "number",
    definition: "Paid, non-cancelled commerce orders in the reporting period.",
  },
  aov: {
    label: "Average order value",
    unit: "currency",
    definition: "Net order sales divided by paid, non-cancelled order count.",
  },
  refunds: {
    label: "Refunds",
    unit: "currency",
    definition:
      "Refund amount on events in the reporting period from the canonical source; not refund-date accounting.",
  },
  spend: {
    label: "Marketing spend",
    unit: "currency",
    definition: "Campaign spend in the workspace currency.",
  },
  ratio: {
    label: "Revenue / spend",
    unit: "ratio",
    definition:
      "Blended, non-attributed revenue-to-spend ratio. Does not establish campaign attribution.",
  },
} as const;
export type Metric = keyof typeof metrics;
export const metricSchema = z.enum([
  "revenue",
  "orders",
  "aov",
  "refunds",
  "spend",
  "ratio",
]);
export const reportSchema = z.object({
  name: z.string().trim().min(1).max(100),
  metric: metricSchema,
  group: z.enum(["day", "week", "month"]),
  from: z.iso.date(),
  to: z.iso.date(),
  sourceId: z.string().optional(),
});
export type ReportDefinition = z.infer<typeof reportSchema>;
export const filterSchema = z.object({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  group: z.enum(["day", "week", "month"]).default("day"),
  sourceId: z.string().optional(),
});
export type AnalyticsFilter = z.infer<typeof filterSchema>;
export interface Identity {
  id: string;
  name: string;
  email: string;
  role: Role;
  workspaceId: string;
}
export interface MetricValue {
  value: number | null;
  previous: number | null;
  change: number | null;
}
export interface TrendPoint {
  date: string;
  revenue: number | null;
  orders: number | null;
  aov: number | null;
  refunds: number | null;
  spend: number | null;
  ratio: number | null;
  payments: number | null;
}
export interface AnalyticsResult {
  summary: Record<Metric, MetricValue>;
  trends: TrendPoint[];
  channels: { channel: string; spend: number }[];
  period: { from: string; to: string; timezone: string; canonical: string };
  currency: string;
  updatedAt: string | null;
  warnings: string[];
}
export interface Source {
  id: string;
  name: string;
  provider: string;
  mode: string;
  status: string;
  lastSuccess: string | null;
  cursor: string | null;
  _count: { orders: number; payments: number; campaigns: number };
  runs: SyncRun[];
}
export interface SyncRun {
  id: string;
  sourceId: string;
  status: string;
  processed: number;
  created: number;
  updated: number;
  failed: number;
  attempt: number;
  error: string | null;
  queuedAt: string;
  completedAt: string | null;
  source?: { name: string };
}
export interface SavedReport extends ReportDefinition {
  id: string;
}
export interface Column {
  key: string;
  label: string;
  type?: "currency" | "date" | "number" | "status";
}
export interface DataPage {
  data: Record<string, unknown>[];
  total: number;
  page: number;
  pageSize: number;
}
export function periodChange(
  value: number | null,
  previous: number | null,
): number | null {
  return value === null || previous === null || previous === 0
    ? null
    : Math.round(((value - previous) / Math.abs(previous)) * 1000) / 10;
}
