import { Router } from "express";
import { db } from "../config/database.js";
import { z } from "zod";
import { authorize } from "../modules/auth/auth.js";
import { sourceFor, sourceInclude } from "../modules/sources/access.js";
import { audit } from "../shared/audit.js";
import {
  requestSync,
  assertSyncable,
} from "../modules/synchronization/service.js";
import { syncQueue } from "../jobs/queues.js";
const admin = authorize("ADMIN");
export const sourcesRoutes = Router();
sourcesRoutes.get("/data-sources", async (req, res) =>
  res.json(
    await db.dataSourceConnection.findMany({
      where: { workspaceId: req.identity.workspaceId },
      include: sourceInclude,
      orderBy: { createdAt: "asc" },
    }),
  ),
);
sourcesRoutes.get("/data-sources/:id", async (req, res) =>
  res.json(await sourceFor(String(req.params.id), req.identity.workspaceId)),
);
sourcesRoutes.get("/data-sources/:id/status", async (req, res) =>
  res.json(await sourceFor(String(req.params.id), req.identity.workspaceId)),
);
sourcesRoutes.post("/data-sources/:id/sync", admin, async (req, res) =>
  res
    .status(202)
    .json(
      await requestSync(
        String(req.params.id),
        req.identity.workspaceId,
        req.identity.id,
      ),
    ),
);
sourcesRoutes.get("/data-sources/:id/sync-runs", async (req, res) => {
  await sourceFor(String(req.params.id), req.identity.workspaceId);
  res.json(
    await db.syncRun.findMany({
      where: { sourceId: String(req.params.id) },
      orderBy: { queuedAt: "desc" },
      take: 100,
    }),
  );
});
sourcesRoutes.get("/data-sources/:id/schedule", admin, async (req, res) => {
  const source = await sourceFor(
    String(req.params.id),
    req.identity.workspaceId,
  );
  const scheduler = await syncQueue.getJobScheduler(`source-${source.id}`);
  const every = Number(scheduler?.every);
  res.json({
    schedule:
      every === 3600000 ? "hourly" : every === 86400000 ? "daily" : "off",
  });
});
sourcesRoutes.patch("/data-sources/:id/schedule", admin, async (req, res) => {
  const source = await sourceFor(
    String(req.params.id),
    req.identity.workspaceId,
  );
  const { schedule } = z
    .object({ schedule: z.enum(["off", "hourly", "daily"]) })
    .parse(req.body);
  if (schedule !== "off") assertSyncable(source);
  if (schedule === "off")
    await syncQueue.removeJobScheduler(`source-${source.id}`);
  else
    await syncQueue.upsertJobScheduler(
      `source-${source.id}`,
      { every: schedule === "hourly" ? 3600000 : 86400000 },
      { name: "scheduled", data: { sourceId: source.id } },
    );
  await audit(req.identity, "schedule.updated", source.id);
  res.json({ schedule });
});
sourcesRoutes.get("/sync-runs", async (req, res) =>
  res.json(
    await db.syncRun.findMany({
      where: { source: { workspaceId: req.identity.workspaceId } },
      include: { source: { select: { name: true } } },
      orderBy: { queuedAt: "desc" },
      take: 100,
    }),
  ),
);
