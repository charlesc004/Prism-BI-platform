import type { Job } from "bullmq";
import { db } from "../config/database.js";
import { processIngestion } from "./process.js";
import { invalidateAnalytics } from "../modules/analytics/service.js";
import type { SyncJob } from "./queues.js";
export async function processWithStatus(job: Job<SyncJob>) {
  try {
    await processIngestion(job);
  } catch (error) {
    const attempt = job.attemptsMade + 1,
      final = attempt >= (job.opts.attempts || 1);
    const message =
      "Ingestion failed. Check provider configuration, availability, and supported USD data. Committed pages are retained; retries are idempotent.";
    const workspaceId = await db.$transaction(async (tx) => {
      if (job.data.runId)
        await tx.syncRun.update({
          where: { id: job.data.runId },
          data: {
            status: final ? "FAILED" : "RETRY_SCHEDULED",
            error: message,
            attempt,
            ...(final ? { completedAt: new Date(), failed: 1 } : {}),
          },
        });
      if (!final) return null;
      const source = await tx.dataSourceConnection.update({
        where: { id: job.data.sourceId },
        data: { status: "ERROR" },
      });
      if (job.data.importId)
        await tx.importBatch.update({
          where: { id: job.data.importId },
          data: { status: "FAILED", payload: null },
        });
      return source.workspaceId;
    });
    if (workspaceId) await invalidateAnalytics(workspaceId);
    throw error;
  }
}
