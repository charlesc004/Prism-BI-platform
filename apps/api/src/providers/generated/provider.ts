import { readFileSync } from "node:fs";
import { env } from "../../config/env.js";
import type { DataProvider, NormalizedRecord } from "../contracts.js";
const fixture = JSON.parse(
  readFileSync(
    new URL("../../../../../fixtures/generated-data.json", import.meta.url),
    "utf8",
  ),
) as {
  seed: number;
  days: number;
  pageSize: number;
  channels: string[];
  campaigns: string[];
};
export function generatedRecords(
  provider: string,
  reference = env.SEED_REFERENCE_DATE,
): NormalizedRecord[] {
  const records: NormalizedRecord[] = [];
  const end = new Date(`${reference}T23:00:00Z`).getTime();
  for (let day = 0; day < fixture.days; day++) {
    const date = new Date(end - (fixture.days - 1 - day) * 86400000);
    const dateId = date.toISOString().slice(0, 10);
    const noise = (day * fixture.seed) % 97;
    const count = 5 + (noise % 9) + Math.floor(day / 90);
    if (provider === "CSV") {
      fixture.channels.forEach((channel, i) =>
        records.push({
          kind: "campaign",
          externalId: `${dateId}-${i}`,
          occurredAt: new Date(`${dateId}T12:00:00Z`),
          currency: "USD",
          campaign: fixture.campaigns[i],
          channel,
          spend: 1800 + noise * 30 + i * 400,
          clicks: 80 + noise * 2,
          impressions: 4000 + noise * 83,
        }),
      );
    } else
      for (let n = 0; n < count; n++) {
        const gross = 3800 + ((noise * 131 + n * 977) % 22000),
          discount = n % 4 === 0 ? 500 : 0,
          refund = (day + n) % 23 === 0 ? Math.floor(gross / 2) : 0;
        const occurredAt = new Date(date.getTime() - n * 1800000);
        const cancelled = (day + n) % 41 === 0;
        records.push(
          provider === "SHOPIFY"
            ? {
                kind: "order",
                externalId: `NS-${dateId}-${n}`,
                occurredAt,
                currency: "USD",
                gross,
                discount,
                refund,
                status: cancelled ? "CANCELLED" : "PAID",
              }
            : {
                kind: "payment",
                externalId: `pi_${dateId}_${n}`,
                occurredAt,
                currency: "USD",
                amount: gross - discount,
                refund,
                status: cancelled ? "FAILED" : "SUCCEEDED",
              },
        );
      }
  }
  return records;
}
export class GeneratedProvider implements DataProvider {
  constructor(private provider: string) {}
  async fetchPage({ cursor, since }: { cursor?: string; since?: string }) {
    // A one-day overlap shows retry-safe updates, including refunds on recent events.
    const rows = generatedRecords(this.provider).filter(
      (r) =>
        !since ||
        r.occurredAt.getTime() >= new Date(since).getTime() - 86400000,
    );
    const offset = Number(cursor || 0),
      records = rows.slice(offset, offset + fixture.pageSize);
    return {
      records,
      nextCursor:
        offset + fixture.pageSize < rows.length
          ? String(offset + fixture.pageSize)
          : undefined,
      checkpoint: `${env.SEED_REFERENCE_DATE}T00:00:00.000Z`,
    };
  }
}
