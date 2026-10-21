import { Redis } from "ioredis";
import { env } from "./env.js";
import { parseRedisConnection } from "./redis-options.js";
export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 1,
  connectTimeout: 2000,
  lazyConnect: true,
});
redis.on("error", () => {});
export const queueConnection = {
  ...parseRedisConnection(env.REDIS_URL),
  maxRetriesPerRequest: null,
};
