import { Queue } from "bullmq";
import { queueConnection } from "../config/redis.js";
export interface SyncJob {
  runId?: string;
  sourceId: string;
  importId?: string;
}
export const syncQueue = new Queue<SyncJob>("prism-ingestion", {
  connection: {
    ...queueConnection,
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000, jitter: 0.3 },
    removeOnComplete: 100,
    removeOnFail: 100,
  },
});
syncQueue.on("error", () =>
  console.error(JSON.stringify({ event: "queue.connection.error" })),
);
