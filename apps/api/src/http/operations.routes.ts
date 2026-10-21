import { Router } from "express";
import { operationalStatus } from "../shared/health.js";
export const operationsRoutes = Router();
operationsRoutes.get("/operations", async (_req, res) =>
  res.json(await operationalStatus()),
);
