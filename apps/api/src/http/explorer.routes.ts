import { Router } from "express";
import { explore } from "../modules/data-explorer/service.js";
import { toCsv } from "../modules/exports/csv.js";
import { authorize } from "../modules/auth/auth.js";
import { audit } from "../shared/audit.js";
const editor = authorize("ADMIN", "ANALYST");
export const explorerRoutes = Router();
explorerRoutes.get("/data/:dataset", async (req, res) =>
  res.json(
    await explore(
      req.identity.workspaceId,
      String(req.params.dataset),
      req.query,
    ),
  ),
);
explorerRoutes.get("/data/:dataset/export", editor, async (req, res) => {
  const page = await explore(
    req.identity.workspaceId,
    String(req.params.dataset),
    req.query,
    true,
  );
  await audit(req.identity, "data.exported", String(req.params.dataset));
  res.type("text/csv").attachment("prism-records.csv").send(toCsv(page.data));
});
