import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

export async function ensureAdminExists(database: typeof db = db): Promise<void> {
  try {
    const [existingAdmin] = await database
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.username, "admin"))
      .limit(1);

    if (existingAdmin) return;

    // Keep the documented development credentials usable after a fresh reset.
    // Production deployments should always provide DEFAULT_ADMIN_PASSWORD.
    const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || "admin123";
    const passwordHash = await bcrypt.hash(defaultPassword, 12);
    await database.insert(usersTable).values({
      name: "Admin",
      username: "admin",
      passwordHash,
      role: "admin",
    });
    logger.warn(
      { username: "admin" },
      `No admin user found — created default admin. ${process.env.DEFAULT_ADMIN_PASSWORD ? "Using password from DEFAULT_ADMIN_PASSWORD env var." : "Using the documented default password — CHANGE THIS IMMEDIATELY."}`,
    );
  } catch (err) {
    logger.error({ err }, "Failed to ensure admin user exists");
  }
}