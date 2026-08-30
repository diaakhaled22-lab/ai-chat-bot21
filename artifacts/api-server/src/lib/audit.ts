import { db, adminActivityLogsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

export async function logAdminActivity(
  adminId: number,
  action: string,
  details: string | null = null,
  ipAddress: string | null = null
) {
  try {
    const admin = await db.select({ username: usersTable.username }).from(usersTable).where(eq(usersTable.id, adminId)).limit(1);
    const adminUsername = admin[0]?.username ?? "unknown_admin";

    await db.insert(adminActivityLogsTable).values({
      adminId,
      adminUsername,
      action,
      details,
      ipAddress,
    });
  } catch (err) {
    logger.error({ err, adminId, action }, "Failed to log admin activity");
  }
}
