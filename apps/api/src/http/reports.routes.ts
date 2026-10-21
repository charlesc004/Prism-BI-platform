import { Router } from "express";
import { db } from "../config/database.js";
import { z } from "zod";
import { reportSchema } from "@prism/contracts";
import { authorize } from "../modules/auth/auth.js";
import { analytics, reportingRange } from "../modules/analytics/service.js";
import { toCsv } from "../modules/exports/csv.js";
import { sourceFor } from "../modules/sources/access.js";
import { audit } from "../shared/audit.js";
import { AppError } from "../shared/errors.js";
const editor = authorize("ADMIN", "ANALYST");
export const reportsRoutes = Router();
reportsRoutes.get("/reports", async (req, res) =>
  res.json(
    (
      await db.savedReport.findMany({
        where: { workspaceId: req.identity.workspaceId },
        orderBy: { updatedAt: "desc" },
      })
    ).map((r) => ({ ...reportSchema.parse(r.definition), id: r.id })),
  ),
);
reportsRoutes.post("/reports", editor, async (req, res) => {
  const definition = reportSchema.parse(req.body);
  await validateReport(req.identity.workspaceId, definition);
  const report = await db.savedReport.create({
    data: {
      workspaceId: req.identity.workspaceId,
      ownerId: req.identity.id,
      name: definition.name,
      definition,
    },
  });
  await audit(req.identity, "report.created", report.id);
  res.status(201).json({ id: report.id, ...definition });
});
async function reportFor(id: string, workspaceId: string) {
  const report = await db.savedReport.findFirst({ where: { id, workspaceId } });
  if (!report) throw new AppError(404, "Report not found");
  return report;
}
async function validateReport(
  workspaceId: string,
  definition: z.infer<typeof reportSchema>,
) {
  const workspace = await db.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
  });
  reportingRange(definition, workspace.timezone);
  if (definition.sourceId) await sourceFor(definition.sourceId, workspaceId);
}
reportsRoutes.get("/reports/:id", async (req, res) => {
  const report = await reportFor(
    String(req.params.id),
    req.identity.workspaceId,
  );
  res.json({ id: report.id, ...reportSchema.parse(report.definition) });
});
reportsRoutes.patch("/reports/:id", editor, async (req, res) => {
  const report = await reportFor(
      String(req.params.id),
      req.identity.workspaceId,
    ),
    definition = reportSchema.parse(req.body);
  await validateReport(req.identity.workspaceId, definition);
  await db.savedReport.update({
    where: { id: report.id },
    data: { name: definition.name, definition },
  });
  await audit(req.identity, "report.updated", report.id);
  res.json({ id: report.id, ...definition });
});
reportsRoutes.delete("/reports/:id", editor, async (req, res) => {
  const report = await reportFor(
    String(req.params.id),
    req.identity.workspaceId,
  );
  await db.savedReport.delete({ where: { id: report.id } });
  await audit(req.identity, "report.deleted", report.id);
  res.status(204).end();
});
reportsRoutes.post("/reports/:id/preview", async (req, res) => {
  const report = await reportFor(
    String(req.params.id),
    req.identity.workspaceId,
  );
  res.json(
    await analytics(
      req.identity.workspaceId,
      reportSchema.parse(report.definition),
    ),
  );
});
reportsRoutes.post("/report-preview", editor, async (req, res) => {
  const definition = reportSchema.parse(req.body);
  res.json(await analytics(req.identity.workspaceId, definition));
});
reportsRoutes.get("/reports/:id/export", editor, async (req, res) => {
  const report = await reportFor(
      String(req.params.id),
      req.identity.workspaceId,
    ),
    definition = reportSchema.parse(report.definition),
    result = await analytics(req.identity.workspaceId, definition);
  await audit(req.identity, "report.exported", report.id);
  res
    .type("text/csv")
    .attachment("prism-report.csv")
    .send(
      toCsv(
        result.trends.map((r) => ({
          date: r.date,
          metric: definition.metric,
          value: r[definition.metric],
          unit: ["orders", "ratio"].includes(definition.metric)
            ? definition.metric
            : "USD cents",
          timezone: result.period.timezone,
          canonical: result.period.canonical,
        })),
      ),
    );
});
