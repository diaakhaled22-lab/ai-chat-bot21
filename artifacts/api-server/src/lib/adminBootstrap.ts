import crypto from 'crypto';
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
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
    await db.execute(sql`
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS allow_source_website BOOLEAN NOT NULL DEFAULT true;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS allow_source_files BOOLEAN NOT NULL DEFAULT true;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS allow_source_wordpress BOOLEAN NOT NULL DEFAULT true;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS allow_source_rest_api BOOLEAN NOT NULL DEFAULT true;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS allow_source_shopify BOOLEAN NOT NULL DEFAULT true;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS ai_execution_mode TEXT NOT NULL DEFAULT 'quota';
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS quota_start_date TIMESTAMP WITH TIME ZONE;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS quota_end_date TIMESTAMP WITH TIME ZONE;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS google_calendar_enabled BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS google_calendar_id TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS google_calendar_timezone TEXT DEFAULT 'UTC';
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS google_calendar_duration INTEGER DEFAULT 30;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS google_calendar_service_account_key TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS google_calendar_booking_rules TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS business_type TEXT NOT NULL DEFAULT 'general';
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS appointment_date TEXT;
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS doctor TEXT;
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS booking_type TEXT DEFAULT 'new_checkup';
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS notes TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_ip TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS mac_address TEXT;

      -- Ensure all companies have an active monthly token quota assigned (default: 500,000)
      UPDATE companies
      SET monthly_token_quota = 500000
      WHERE monthly_token_quota IS NULL OR monthly_token_quota = 0;

      UPDATE companies
      SET ai_model = 'nvidia/nemotron-3.5-lightning:free'
      WHERE ai_model = 'nvidia/nemotron-nano-9b-v2:free' OR ai_model LIKE '%nemotron-nano%';

      UPDATE admin_config
      SET value = 'nvidia/nemotron-3.5-lightning:free'
      WHERE (key = 'quota_ai_model' OR key = 'support_ai_model')
        AND (value = 'nvidia/nemotron-nano-9b-v2:free' OR value LIKE '%nemotron-nano%');
    `);
    logger.info("Data source permissions schema columns and model migrations ensured successfully");
  } catch (err) {
    logger.error({ err }, "Failed to ensure data source permissions schema columns");
  }
}