import { Redis } from "ioredis";
import process from "node:process";

const redis = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: 1,
  connectTimeout: 2000,
});
redis.on("error", () => {});
try {
  const heartbeat = await redis.get("prism-worker-heartbeat");
  const age = heartbeat ? Date.now() - Date.parse(heartbeat) : Infinity;
  process.exitCode = Number(!Number.isFinite(age) || age > 25000);
} catch {
  process.exitCode = 1;
} finally {
  redis.disconnect();
}
