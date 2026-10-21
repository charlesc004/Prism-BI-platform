import { Worker } from "bullmq";
import { db } from "../config/database.js";
import { redis, queueConnection } from "../config/redis.js";
import { syncQueue, type SyncJob } from "./queues.js";
import { processJob } from "./processor.js";
const worker = new Worker<SyncJob>("prism-ingestion", processJob, {
  connection: queueConnection,
  concurrency: 2,
  limiter: { max: 10, duration: 1000 },
});
worker.on("failed", (job) =>
  console.error(
    JSON.stringify({
      event: "job.failed",
      jobId: job?.id,
      attempt: job?.attemptsMade,
    }),
  ),
);
worker.on("error", () =>
  console.error(JSON.stringify({ event: "worker.connection.error" })),
);
const heartbeat = setInterval(() => {
  void redis
    .set("prism-worker-heartbeat", new Date().toISOString(), "EX", 25)
    .catch(() => {});
}, 10000);
await redis.set("prism-worker-heartbeat", new Date().toISOString(), "EX", 25);
// Recover the DB-to-queue gap after a process crash. Existing jobs retain BullMQ's stalled-job recovery.
for (const run of await db.syncRun.findMany({
  where: { status: { in: ["QUEUED", "RUNNING", "RETRY_SCHEDULED"] } },
})) {
  if (!(await syncQueue.getJob(run.id)))
    await syncQueue.add(
      "sync",
      { runId: run.id, sourceId: run.sourceId },
      { jobId: run.id },
    );
}
for (const batch of await db.importBatch.findMany({
  where: { status: "QUEUED" },
})) {
  if (!(await syncQueue.getJob(batch.id)))
    await syncQueue.add(
      "import",
      { sourceId: batch.sourceId, importId: batch.id },
      { jobId: batch.id },
    );
}
console.log("PRISM worker ready");
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  clearInterval(heartbeat);
  await worker.close();
  await syncQueue.close();
  await redis.quit();
  await db.$disconnect();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
