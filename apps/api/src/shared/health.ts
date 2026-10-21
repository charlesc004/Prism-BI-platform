import { db } from "../config/database.js";
import { redis } from "../config/redis.js";

export async function operationalStatus() {
  const [database, queue] = await Promise.allSettled([
    db.$queryRaw`SELECT 1`,
    redis.ping().then(() => redis.get("prism-worker-heartbeat")),
  ]);
  const heartbeat = queue.status === "fulfilled" ? queue.value : null;
  return {
    api: true,
    database: database.status === "fulfilled",
    redis: queue.status === "fulfilled",
    worker: !!heartbeat,
    heartbeat,
  };
}
