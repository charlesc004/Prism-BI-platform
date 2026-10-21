import { createHash } from "node:crypto";
import { db } from "../../config/database.js";
import { syncQueue } from "../../jobs/queues.js";
import { parseCampaignCsv } from "../../providers/csv/parser.js";
import { AppError } from "../../shared/errors.js";
import { Prisma } from "../../generated/prisma/client.js";

export async function submitCampaignImport(
  workspaceId: string,
  filename: string,
  payload: string,
) {
  const parsed = parseCampaignCsv(payload);
  if (!parsed.records.length)
    throw new AppError(
      400,
      "No valid rows. " + (parsed.errors[0]?.message || ""),
    );
  const fingerprint = createHash("sha256").update(payload).digest("hex");
  const source = await db.dataSourceConnection.findFirst({
    where: { workspaceId, provider: "CSV", mode: "LIVE" },
  });
  if (!source)
    throw new AppError(
      404,
      "CSV upload source is unavailable in this workspace",
    );
  const unique = { workspaceId_fingerprint: { workspaceId, fingerprint } };
  const batch = await db.importBatch
    .upsert({
      where: unique,
      create: {
        workspaceId,
        sourceId: source.id,
        filename: filename.slice(0, 150),
        fingerprint,
        payload,
        errors: parsed.errors,
        rejected: parsed.errors.length,
      },
      update: {},
    })
    .catch(async (error: unknown) => {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2002"
      )
        throw error;
      return db.importBatch.findUniqueOrThrow({ where: unique });
    });
  if (batch.status !== "QUEUED") return { batch, duplicate: true };
  try {
    await syncQueue.add(
      "import",
      { sourceId: source.id, importId: batch.id },
      { jobId: batch.id },
    );
  } catch {
    // A Redis acknowledgement can be lost after enqueue. Keep the durable row for safe replay/recovery.
    throw new AppError(
      503,
      "Upload saved, but the queue is unavailable. Retry the same file to resume safely.",
    );
  }
  return { batch, duplicate: false };
}
