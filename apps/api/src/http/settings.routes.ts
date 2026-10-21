import { Router } from "express";
import { db } from "../config/database.js";
import { z } from "zod";
import { authorize } from "../modules/auth/auth.js";
import { invalidateAnalytics } from "../modules/analytics/service.js";
import { audit } from "../shared/audit.js";
import { AppError } from "../shared/errors.js";
const admin = authorize("ADMIN");
export const settingsRoutes = Router();
settingsRoutes.get("/settings/workspace", async (req, res) =>
  res.json(
    await db.workspace.findUniqueOrThrow({
      where: { id: req.identity.workspaceId },
    }),
  ),
);
settingsRoutes.patch("/settings/workspace", admin, async (req, res) => {
  const data = z
    .object({
      name: z.string().trim().min(1).max(80),
      canonical: z.enum(["SHOPIFY", "STRIPE"]),
      timezone: z.string().refine((t) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: t });
          return true;
        } catch {
          return false;
        }
      }, "Invalid IANA timezone"),
    })
    .parse(req.body);
  const workspace = await db.workspace.update({
    where: { id: req.identity.workspaceId },
    data,
  });
  await invalidateAnalytics(workspace.id);
  await audit(req.identity, "workspace.updated", workspace.id);
  res.json(workspace);
});
settingsRoutes.get("/settings/team", admin, async (req, res) =>
  res.json(
    (
      await db.workspaceMembership.findMany({
        where: { workspaceId: req.identity.workspaceId },
        include: {
          user: { select: { id: true, name: true, email: true, active: true } },
        },
      })
    ).map((m) => ({ ...m.user, role: m.role })),
  ),
);
settingsRoutes.patch("/settings/team/:id", admin, async (req, res) => {
  const { role } = z
    .object({ role: z.enum(["ADMIN", "ANALYST", "VIEWER"]) })
    .parse(req.body);
  if (req.params.id === req.identity.id)
    throw new AppError(400, "You cannot change your own role");
  const member = await db.workspaceMembership.findUnique({
    where: {
      userId_workspaceId: {
        userId: String(req.params.id),
        workspaceId: req.identity.workspaceId,
      },
    },
  });
  if (!member) throw new AppError(404, "Member not found");
  await db.workspaceMembership.update({
    where: {
      userId_workspaceId: {
        userId: member.userId,
        workspaceId: member.workspaceId,
      },
    },
    data: { role },
  });
  await audit(req.identity, "member.role_updated", member.userId);
  res.json({ ok: true });
});
settingsRoutes.get("/audit", admin, async (req, res) =>
  res.json(
    await db.auditLog.findMany({
      where: { workspaceId: req.identity.workspaceId },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ),
);
