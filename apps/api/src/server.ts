import { app } from "./app.js";
import { env } from "./config/env.js";
import { db } from "./config/database.js";
import { redis } from "./config/redis.js";
import { syncQueue } from "./jobs/queues.js";
const server = app.listen(env.PORT, () =>
  console.log(`PRISM API listening on ${env.PORT}`),
);
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => server.closeAllConnections(), 10000);
  deadline.unref();
  // Drain in-flight requests before closing their database/queue connections.
  await new Promise<void>((resolve) => server.close(() => resolve()));
  clearTimeout(deadline);
  await Promise.allSettled([syncQueue.close(), redis.quit(), db.$disconnect()]);
}
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
