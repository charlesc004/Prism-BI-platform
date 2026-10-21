import { db } from "../../config/database.js";
import {
  recordSchema,
  type NormalizedRecord,
} from "../../providers/contracts.js";
import type { Prisma } from "../../generated/prisma/client.js";

type SourceOwner = { id: string; workspaceId: string };
interface RecordWriter<Row> {
  existing: (ids: string[]) => Promise<{ externalId: string }[]>;
  insert: (rows: Row[]) => Promise<{ count: number }>;
  update: (row: Row) => Promise<unknown>;
}

async function persistCollection<Row extends { externalId: string }>(
  rows: Row[],
  writer: RecordWriter<Row>,
) {
  if (!rows.length) return { created: 0, updated: 0 };
  const existing = new Set(
    (await writer.existing(rows.map((row) => row.externalId))).map(
      (row) => row.externalId,
    ),
  );
  const inserted = await writer.insert(
    rows.filter((row) => !existing.has(row.externalId)),
  );
  let updated = 0;
  for (const row of rows) {
    if (!existing.has(row.externalId)) continue;
    await writer.update(row);
    updated++;
  }
  return { created: inserted.count, updated };
}

export async function persistRecords(
  tx: Prisma.TransactionClient,
  source: SourceOwner,
  records: NormalizedRecord[],
) {
  const valid = records.map((raw) => recordSchema.parse(raw));
  const ownership = { sourceId: source.id, workspaceId: source.workspaceId };
  const where = (externalId: string) => ({
    sourceId_externalId: { sourceId: source.id, externalId },
  });
  const lookup = (ids: string[]) => ({
    where: { sourceId: source.id, externalId: { in: ids } },
    select: { externalId: true as const },
  });
  const orders = valid
    .filter((row) => row.kind === "order")
    .map(({ kind: _kind, ...row }) => ({ ...row, ...ownership }));
  const payments = valid
    .filter((row) => row.kind === "payment")
    .map(({ kind: _kind, ...row }) => ({ ...row, ...ownership }));
  const campaigns = valid
    .filter((row) => row.kind === "campaign")
    .map(({ kind: _kind, ...row }) => ({ ...row, ...ownership }));

  // Share the algorithm while retaining each Prisma model's field validation.
  const counts = [
    await persistCollection(orders, {
      existing: (ids) => tx.commerceOrder.findMany(lookup(ids)),
      insert: (data) =>
        tx.commerceOrder.createMany({ data, skipDuplicates: true }),
      update: (row) =>
        tx.commerceOrder.update({ where: where(row.externalId), data: row }),
    }),
    await persistCollection(payments, {
      existing: (ids) => tx.paymentRecord.findMany(lookup(ids)),
      insert: (data) =>
        tx.paymentRecord.createMany({ data, skipDuplicates: true }),
      update: (row) =>
        tx.paymentRecord.update({ where: where(row.externalId), data: row }),
    }),
    await persistCollection(campaigns, {
      existing: (ids) => tx.campaignSpend.findMany(lookup(ids)),
      insert: (data) =>
        tx.campaignSpend.createMany({ data, skipDuplicates: true }),
      update: (row) =>
        tx.campaignSpend.update({ where: where(row.externalId), data: row }),
    }),
  ];
  return counts.reduce(
    (total, count) => ({
      created: total.created + count.created,
      updated: total.updated + count.updated,
    }),
    { created: 0, updated: 0 },
  );
}

export async function ingestPage(
  source: SourceOwner,
  records: NormalizedRecord[],
) {
  return db.$transaction((tx) => persistRecords(tx, source, records), {
    timeout: 60000,
  });
}
