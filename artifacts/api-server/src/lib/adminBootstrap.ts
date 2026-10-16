import crypto from 'crypto';
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
    if (!process.env.DEFAULT_ADMIN_PASSWORD && process.env.NODE_ENV === 'production') {
      logger.error('SECURITY: DEFAULT_ADMIN_PASSWORD env var is required in production. Refusing to create admin with weak default.');
      return;
    }
    const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || crypto.randomBytes(16).toString('hex');
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

export async function ensureDataSourcePermissionsSchema(): Promise<void> {
  try {
    const { pool } = await import("@workspace/db");
    if (!pool) return;
    await pool.query(`
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS allow_source_website BOOLEAN NOT NULL DEFAULT true;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS allow_source_files BOOLEAN NOT NULL DEFAULT true;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS allow_source_wordpress BOOLEAN NOT NULL DEFAULT true;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS allow_source_rest_api BOOLEAN NOT NULL DEFAULT true;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS allow_source_shopify BOOLEAN NOT NULL DEFAULT true;
    `);
    logger.info("Data source permissions schema columns ensured successfully");
  } catch (err) {
    logger.error({ err }, "Failed to ensure data source permissions schema columns");
  }
}