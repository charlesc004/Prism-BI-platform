import type { Job } from "bullmq";
import { db } from "../config/database.js";
import { getProvider } from "../providers/registry.js";
import { persistRecords } from "../modules/ingestion/persist.js";
import { invalidateAnalytics } from "../modules/analytics/service.js";
import { parseCampaignCsv } from "../providers/csv/parser.js";
import type { SyncJob } from "./queues.js";
export async function processIngestion(job: Job<SyncJob>) {
  const source = await db.dataSourceConnection.findUniqueOrThrow({
    where: { id: job.data.sourceId },
  });
  if (job.data.importId) {
    const batch = await db.importBatch.findUniqueOrThrow({
      where: { id: job.data.importId },
    });
    if (batch.status === "COMPLETED" || batch.status === "PARTIAL") return;
    const parsed = parseCampaignCsv(batch.payload || "");
    await db.$transaction(
      async (tx) => {
        await persistRecords(tx, source, parsed.records);
        await tx.importBatch.update({
          where: { id: batch.id },
          data: {
            status: parsed.errors.length ? "PARTIAL" : "COMPLETED",
            imported: parsed.records.length,
            rejected: parsed.errors.length,
            errors: parsed.errors,
            payload: null,
          },
        });
        await tx.dataSourceConnection.update({
          where: { id: source.id },
          data: { lastSuccess: new Date(), status: "READY" },
        });
      },
      { timeout: 120000 },
    );
    await invalidateAnalytics(source.workspaceId);
    return;
  }
  const runId = job.data.runId;
  if (!runId) throw new Error("Missing sync run");
  const run = await db.syncRun.findUniqueOrThrow({ where: { id: runId } });
  if (run.status === "COMPLETED") return;
  await db.syncRun.update({
    where: { id: runId },
    data: {
      status: "RUNNING",
      startedAt: new Date(),
      attempt: job.attemptsMade + 1,
      error: null,
    },
  });
  const provider = getProvider(source),
    since = source.cursor;
  let cursor: string | undefined, checkpoint: string | undefined;
  const seen = new Set<string>();
  do {
    const page = await provider.fetchPage({
      cursor,
      since: since || undefined,
    });
    if (page.nextCursor && seen.has(page.nextCursor))
      throw new Error("Provider repeated a pagination cursor");
    if (page.nextCursor) seen.add(page.nextCursor);
    if (seen.size > 2000)
      throw new Error("Provider exceeded pagination safety limit");
    await db.$transaction(
      async (tx) => {
        const counts = await persistRecords(tx, source, page.records);
        await tx.syncRun.update({
          where: { id: runId },
          data: {
            processed: { increment: page.records.length },
            created: { increment: counts.created },
            updated: { increment: counts.updated },
          },
        });
      },
      { timeout: 60000 },
    );
    // Invalidate after every committed page, including pages preceding a later failure.
    await invalidateAnalytics(source.workspaceId);
    cursor = page.nextCursor;
    checkpoint = page.checkpoint || checkpoint;
  } while (cursor);
  await db.$transaction([
    db.dataSourceConnection.update({
      where: { id: source.id },
      data: { cursor: checkpoint, lastSuccess: new Date(), status: "READY" },
    }),
    db.syncRun.update({
      where: { id: runId },
      data: { status: "COMPLETED", completedAt: new Date() },
    }),
  ]);
  await invalidateAnalytics(source.workspaceId);
}
