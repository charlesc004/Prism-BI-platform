import { submitCampaignImport } from "../modules/ingestion/imports.js";
import { Router } from "express";
import multer from "multer";
import { db } from "../config/database.js";
import { authorize } from "../modules/auth/auth.js";
import { audit } from "../shared/audit.js";
import { AppError } from "../shared/errors.js";
const editor = authorize("ADMIN", "ANALYST");
export const importsRoutes = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
});
importsRoutes.post(
  "/imports/csv",
  editor,
  upload.single("file"),
  async (req, res) => {
    if (!req.file || !req.file.originalname.toLowerCase().endsWith(".csv"))
      throw new AppError(400, "Upload a .csv file, maximum 2 MB");
    const { batch, duplicate } = await submitCampaignImport(
      req.identity.workspaceId,
      req.file.originalname,
      req.file.buffer.toString("utf8"),
    );
    await audit(req.identity, "csv.uploaded", batch.id);
    res
      .status(duplicate ? 200 : 202)
      .json({ ...batch, payload: undefined, duplicate });
  },
);
const importSelect = {
  id: true,
  filename: true,
  status: true,
  imported: true,
  rejected: true,
  errors: true,
  createdAt: true,
};
importsRoutes.get("/imports", async (req, res) =>
  res.json(
    await db.importBatch.findMany({
      where: { workspaceId: req.identity.workspaceId },
      select: importSelect,
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ),
);
importsRoutes.get("/imports/:id", async (req, res) => {
  const batch = await db.importBatch.findFirst({
    where: { id: String(req.params.id), workspaceId: req.identity.workspaceId },
    select: importSelect,
  });
  if (!batch) throw new AppError(404, "Import not found");
  res.json(batch);
});
importsRoutes.get("/imports/:id/errors", async (req, res) => {
  const batch = await db.importBatch.findFirst({
    where: { id: String(req.params.id), workspaceId: req.identity.workspaceId },
    select: { errors: true },
  });
  if (!batch) throw new AppError(404, "Import not found");
  res.json(batch.errors);
});
