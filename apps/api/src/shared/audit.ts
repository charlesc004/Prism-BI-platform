import { db } from "../config/database.js";
export async function audit(
  identity: { workspaceId: string; id: string },
  action: string,
  resourceId: string,
) {
  await db.auditLog.create({
    data: {
      workspaceId: identity.workspaceId,
      actorId: identity.id,
      action,
      resourceId,
    },
  });
}
