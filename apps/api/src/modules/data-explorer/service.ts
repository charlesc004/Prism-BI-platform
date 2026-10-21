import { z } from "zod";
import { db } from "../../config/database.js";
import { reportingRange } from "../analytics/service.js";
import { AppError } from "../../shared/errors.js";
export const explorerSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(100).default(""),
  sort: z.enum(["occurredAt", "externalId"]).default("occurredAt"),
  direction: z.enum(["asc", "desc"]).default("desc"),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  sourceId: z.string().optional(),
});
export async function explore(
  workspaceId: string,
  dataset: string,
  query: unknown,
  exporting = false,
) {
  const filter = explorerSchema.parse(query);
  const workspace = await db.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
  });
  const { from, to } = reportingRange(
    { ...filter, group: "day" },
    workspace.timezone,
  );
  const where = {
    workspaceId,
    occurredAt: { gte: from.toJSDate(), lt: to.toJSDate() },
    ...(filter.sourceId ? { sourceId: filter.sourceId } : {}),
    ...(filter.search
      ? {
          externalId: { contains: filter.search, mode: "insensitive" as const },
        }
      : {}),
  };
  const args = {
    where,
    orderBy: [{ [filter.sort]: filter.direction }, { id: filter.direction }],
    take: exporting ? 10001 : filter.pageSize,
    skip: exporting ? 0 : (filter.page - 1) * filter.pageSize,
  };
  const campaignWhere = {
    ...where,
    ...(filter.search
      ? {
          externalId: undefined,
          campaign: { contains: filter.search, mode: "insensitive" as const },
        }
      : {}),
  };
  const result =
    dataset === "orders"
      ? await Promise.all([
          db.commerceOrder.findMany(args),
          db.commerceOrder.count({ where }),
        ])
      : dataset === "payments"
        ? await Promise.all([
            db.paymentRecord.findMany(args),
            db.paymentRecord.count({ where }),
          ])
        : dataset === "campaign-spend"
          ? await Promise.all([
              db.campaignSpend.findMany({
                ...args,
                where: campaignWhere,
              }),
              db.campaignSpend.count({
                where: campaignWhere,
              }),
            ])
          : null;
  if (!result) throw new AppError(404, "Dataset not found");
  if (exporting && result[0].length > 10000)
    throw new AppError(
      400,
      "Export is limited to 10,000 rows. Narrow the filters.",
    );
  return {
    data: result[0],
    total: result[1],
    page: filter.page,
    pageSize: filter.pageSize,
  };
}
