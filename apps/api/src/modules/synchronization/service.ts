import { db } from "../../config/database.js";
import { syncQueue } from "../../jobs/queues.js";
import { AppError } from "../../shared/errors.js";
export function assertSyncable(source: {
  provider: string;
  mode: string;
  status: string;
}) {
  if (source.provider === "CSV" && source.mode === "LIVE")
    throw new AppError(400, "Use the CSV upload endpoint for this source");
  if (source.mode === "LIVE" && source.status === "NOT_CONFIGURED")
    throw new AppError(
      409,
      "Configure provider credentials on the server first",
    );
}
export async function requestSync(
  sourceId: string,
  workspaceId: string,
  actorId: string,
) {
  const run = await db.$transaction(async (tx) => {
    const source = await tx.dataSourceConnection.findFirst({
      where: { id: sourceId, workspaceId },
    });
    if (!source) throw new AppError(404, "Source not found");
    assertSyncable(source);
    const claimed = await tx.dataSourceConnection.updateMany({
      where: { id: sourceId, status: { not: "SYNCING" } },
      data: { status: "SYNCING" },
    });
    if (!claimed.count)
      throw new AppError(
        409,
        "A synchronization is already active for this source",
      );
    const run = await tx.syncRun.create({ data: { sourceId } });
    await tx.auditLog.create({
      data: {
        workspaceId,
        actorId,
        action: "sync.requested",
        resourceId: run.id,
      },
    });
    return run;
  });
  try {
    await syncQueue.add("sync", { runId: run.id, sourceId }, { jobId: run.id });
  } catch {
    // Enqueue may succeed before its acknowledgement is lost. Preserve the claim
    // and durable run; worker startup recovers a missing job with the same ID.
    throw new AppError(
      503,
      "Synchronization saved, but the queue could not confirm it. Restore Redis and restart the worker to resume pending jobs.",
    );
  }
  return run;
}
