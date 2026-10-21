import { Router } from "express";
import { analytics } from "../modules/analytics/service.js";
import { filterSchema } from "@prism/contracts";
export const analyticsRoutes = Router();
for (const path of [
  "/dashboard/summary",
  "/dashboard/trends",
  "/dashboard/sources",
  "/analytics/revenue",
  "/analytics/orders",
  "/analytics/payments",
  "/analytics/refunds",
  "/analytics/campaigns",
  "/analytics/comparison",
])
  analyticsRoutes.get(path, async (req, res) =>
    res.json(
      await analytics(req.identity.workspaceId, filterSchema.parse(req.query)),
    ),
  );
