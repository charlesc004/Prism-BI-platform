import type { Job } from "bullmq";
import { db } from "../config/database.js";
import { requestSync } from "../modules/synchronization/service.js";
import { AppError } from "../shared/errors.js";
import { processWithStatus } from "./failure.js";
import type { SyncJob } from "./queues.js";

export async function processJob(job: Job<SyncJob>) {
  if (job.name !== "scheduled") return processWithStatus(job);
  const source = await db.dataSourceConnection.findUniqueOrThrow({
    where: { id: job.data.sourceId },
  });
  try {
    await requestSync(source.id, source.workspaceId, "scheduler");
  } catch (error) {
    // An overlapping scheduled scan is skipped; dependency/provider failures still retry.
    if (!(
      error instanceof AppError &&
      error.status === 409 &&
      error.message.includes("already active")
    ))
      throw error;
  }
}
