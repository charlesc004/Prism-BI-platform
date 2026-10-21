import { z } from "zod";
const base = {
  externalId: z.string().min(1),
  occurredAt: z.coerce.date(),
  currency: z.literal("USD"),
};
const boundedInteger = z.number().int().nonnegative().max(2_000_000_000);
export const recordSchema = z.discriminatedUnion("kind", [
  z.object({
    ...base,
    kind: z.literal("order"),
    gross: boundedInteger,
    discount: boundedInteger,
    refund: boundedInteger,
    status: z.enum(["PAID", "PENDING", "CANCELLED"]),
  }),
  z.object({
    ...base,
    kind: z.literal("payment"),
    amount: boundedInteger,
    refund: boundedInteger,
    status: z.enum(["SUCCEEDED", "FAILED", "PENDING"]),
  }),
  z.object({
    ...base,
    kind: z.literal("campaign"),
    campaign: z.string().min(1).max(150),
    channel: z.string().min(1).max(80),
    spend: boundedInteger,
    clicks: boundedInteger,
    impressions: boundedInteger,
  }),
]);
export type NormalizedRecord = z.infer<typeof recordSchema>;
export interface ProviderPage {
  records: NormalizedRecord[];
  nextCursor?: string;
  checkpoint?: string;
}
export interface DataProvider {
  fetchPage(options: {
    cursor?: string;
    since?: string;
  }): Promise<ProviderPage>;
}
export function minorUnits(value: string): number {
  if (!/^\d+(\.\d{1,2})?$/.test(value))
    throw new Error("Amount must have at most two decimal places");
  const [whole, fraction = ""] = value.split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(result) || result > 2_000_000_000)
    throw new Error("Amount outside supported range");
  return result;
}
