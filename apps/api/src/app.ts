import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import { MulterError } from "multer";
import { operationalStatus } from "./shared/health.js";
import { env } from "./config/env.js";
import { routes } from "./routes.js";
import { AppError } from "./shared/errors.js";
export const app = express();
app.disable("x-powered-by");
app.use(
  helmet(),
  cors({ origin: env.WEB_ORIGIN, credentials: true }),
  cookieParser(),
);
app.use((req, res, next) => {
  const requestId = randomUUID();
  res.setHeader("X-Request-Id", requestId);
  const start = Date.now();
  res.on("finish", () => {
    if (env.NODE_ENV !== "test")
      console.log(
        JSON.stringify({
          requestId,
          method: req.method,
          path: req.path,
          status: res.statusCode,
          durationMs: Date.now() - start,
        }),
      );
  });
  next();
});
app.use(express.json({ limit: "100kb" }));
app.get("/health", (_req, res) => res.json({ api: true }));
app.get("/health/ready", async (_req, res) => {
  const status = await operationalStatus();
  res
    .status(status.database && status.redis && status.worker ? 200 : 503)
    .json(status);
});
app.use(
  "/api/v1",
  (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  },
  rateLimit({
    windowMs: 60000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
  }),
  routes,
);
app.use((_req, _res, next) => next(new AppError(404, "Endpoint not found")));
app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    const bodyError =
      error && typeof error === "object" && "type" in error ? error.type : null;
    const status =
      error instanceof AppError
        ? error.status
        : error instanceof ZodError || error instanceof MulterError
          ? 400
          : bodyError === "entity.parse.failed"
            ? 400
            : bodyError === "entity.too.large"
              ? 413
              : 500;
    const message =
      error instanceof AppError
        ? error.message
        : error instanceof ZodError
          ? "Invalid input: " +
            error.issues
              .map((i) => i.path.join(".") + " " + i.message)
              .slice(0, 5)
              .join("; ")
          : error instanceof MulterError
            ? "Upload too large. Maximum size is 2 MB."
            : bodyError === "entity.parse.failed"
              ? "Request body must contain valid JSON"
              : bodyError === "entity.too.large"
                ? "Request body exceeds the 100 KB limit"
                : "An unexpected server error occurred";
    if (status === 500)
      console.error(
        JSON.stringify({
          event: "request.failed",
          category: error instanceof Error ? error.name : "unknown",
        }),
      );
    res
      .status(status)
      .json({ error: { message, requestId: res.getHeader("X-Request-Id") } });
  },
);
