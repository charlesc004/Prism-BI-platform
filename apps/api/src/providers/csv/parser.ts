import { parse } from "csv-parse/sync";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  minorUnits,
  recordSchema,
  type NormalizedRecord,
} from "../contracts.js";
import { AppError } from "../../shared/errors.js";
const columns = [
  "date",
  "campaign",
  "channel",
  "spend",
  "clicks",
  "impressions",
];
const countField = z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int().nonnegative().max(2_000_000_000));
const rowSchema = z.object({
  date: z.iso.date(),
  campaign: z.string().min(1).max(150),
  channel: z.string().min(1).max(80),
  spend: z.string(),
  clicks: countField,
  impressions: countField,
  currency: z.literal("USD").optional(),
});
export function parseCampaignCsv(text: string) {
  let rows: Record<string, string>[];
  try {
    rows = parse(text, {
      bom: true,
      skip_empty_lines: true,
      trim: true,
      columns: (header: string[]) => {
        if (
          columns.some((c) => !header.includes(c)) ||
          new Set(header).size !== header.length
        )
          throw new Error("Required columns: " + columns.join(","));
        return header;
      },
    }) as Record<string, string>[];
  } catch {
    throw new AppError(
      400,
      "Invalid CSV. Required columns: " + columns.join(","),
    );
  }
  if (rows.length === 0 || rows.length > 10000)
    throw new AppError(400, "CSV must contain 1–10,000 rows");
  const records: NormalizedRecord[] = [],
    errors: { row: number; message: string }[] = [],
    seen = new Set<string>();
  rows.forEach((raw, i) => {
    try {
      const row = rowSchema.parse(raw);
      const externalId = createHash("sha256")
        .update(JSON.stringify([row.date, row.campaign, row.channel]))
        .digest("hex");
      if (seen.has(externalId))
        throw new Error("Duplicate date, campaign and channel");
      const record = recordSchema.parse({
        kind: "campaign",
        externalId,
        occurredAt: new Date(row.date + "T12:00:00Z"),
        currency: "USD",
        campaign: row.campaign,
        channel: row.channel,
        spend: minorUnits(row.spend),
        clicks: row.clicks,
        impressions: row.impressions,
      });
      records.push(record);
      seen.add(externalId);
    } catch (error) {
      errors.push({
        row: i + 2,
        message:
          error instanceof z.ZodError
            ? "Invalid date, text, currency or non-negative numeric field"
            : (error as Error).message,
      });
    }
  });
  return { records, errors };
}
