import { db } from "../../config/database.js";
import { AppError } from "../../shared/errors.js";
export const sourceInclude = {
  _count: { select: { orders: true, payments: true, campaigns: true } },
  runs: { orderBy: { queuedAt: "desc" as const }, take: 3 },
};
export async function sourceFor(id: string, workspaceId: string) {
  const source = await db.dataSourceConnection.findFirst({
    where: { id, workspaceId },
    include: sourceInclude,
  });
  if (!source) throw new AppError(404, "Source not found");
  return source;
}
