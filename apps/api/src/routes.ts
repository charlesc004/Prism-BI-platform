import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { db } from "./config/database.js";
import { env } from "./config/env.js";
import {
  authenticate,
  login,
  refresh,
  clearCookies,
} from "./modules/auth/auth.js";
import { AppError } from "./shared/errors.js";
import { openapi } from "./openapi.js";
import { analyticsRoutes } from "./http/analytics.routes.js";
import { sourcesRoutes } from "./http/sources.routes.js";
import { operationsRoutes } from "./http/operations.routes.js";
import { importsRoutes } from "./http/imports.routes.js";
import { explorerRoutes } from "./http/explorer.routes.js";
import { reportsRoutes } from "./http/reports.routes.js";
import { settingsRoutes } from "./http/settings.routes.js";
export const routes = Router();
routes.get("/openapi.json", (_req, res) => res.json(openapi));
routes.use((req, _res, next) => {
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    req.get("origin") &&
    req.get("origin") !== env.WEB_ORIGIN
  )
    throw new AppError(403, "Origin not allowed");
  next();
});
routes.post(
  "/auth/login",
  rateLimit({
    windowMs: 15 * 60000,
    limit: 15,
    standardHeaders: true,
    legacyHeaders: false,
  }),
  async (req, res) => {
    const input = z
      .object({ email: z.email(), password: z.string().min(1).max(200) })
      .parse(req.body);
    await login(input.email, input.password, res);
    res.json({ ok: true });
  },
);
routes.post("/auth/refresh", async (req, res) => {
  await refresh(req, res);
  res.json({ ok: true });
});
routes.use(authenticate);
routes.get("/auth/me", (req, res) => res.json(req.identity));
routes.post("/auth/logout", async (req, res) => {
  await db.session.deleteMany({ where: { id: req.sessionId } });
  clearCookies(res);
  res.json({ ok: true });
});
routes.use(analyticsRoutes);
routes.use(sourcesRoutes);
routes.use(operationsRoutes);
routes.use(importsRoutes);
routes.use(explorerRoutes);
routes.use(reportsRoutes);
routes.use(settingsRoutes);
