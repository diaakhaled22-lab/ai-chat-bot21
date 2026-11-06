import crypto from 'crypto';
import bcrypt from "bcryptjs";
import { db, usersTable, adminConfigTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "./logger";
import { DEFAULT_PACKAGES_CATALOG } from "./packagesCatalog";

export async function ensureAdminExists(database: typeof db = db): Promise<void> {
  try {
    const admins = await database
      .select({ id: usersTable.id, passwordHash: usersTable.passwordHash })
      .from(usersTable)
      .where(eq(usersTable.role, "admin"));
    const configuredPassword = process.env.DEFAULT_ADMIN_PASSWORD;
    for (const admin of admins) {
      if (await bcrypt.compare("admin123", admin.passwordHash)) {
        const replacementPassword = configuredPassword && configuredPassword !== "admin123" && configuredPassword.length >= 16
          ? configuredPassword
          : crypto.randomBytes(32).toString("hex");
        await database.update(usersTable)
          .set({ passwordHash: await bcrypt.hash(replacementPassword, 12) })
          .where(eq(usersTable.id, admin.id));
        logger.error(
          { userId: admin.id },
          configuredPassword && replacementPassword === configuredPassword
            ? "SECURITY: Rotated an admin password matching the documented weak credential to DEFAULT_ADMIN_PASSWORD."
            : "SECURITY: Rotated an admin password matching the documented weak credential to an undisclosed random value; configure a strong DEFAULT_ADMIN_PASSWORD and rotate it through a secure recovery process.",
        );
      }
    }

    const [existingAdmin] = await database
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.username, "admin"))
      .limit(1);

    if (existingAdmin) return;

    if (configuredPassword && (configuredPassword === "admin123" || configuredPassword.length < 16)) {
      logger.error("SECURITY: DEFAULT_ADMIN_PASSWORD must not be admin123 and must be at least 16 characters.");
      return;
    }
    if (!configuredPassword && process.env.NODE_ENV === "production") {
      logger.error("SECURITY: DEFAULT_ADMIN_PASSWORD is required in production. Refusing to create an admin.");
      return;
    }
    const defaultPassword = configuredPassword || crypto.randomBytes(32).toString("hex");
    const passwordHash = await bcrypt.hash(defaultPassword, 12);
    await database.insert(usersTable).values({
      name: "Admin",
      username: "admin",
      passwordHash,
      role: "admin",
    });
    logger.warn(
      { username: "admin" },
      `No admin user found — created admin with ${configuredPassword ? "DEFAULT_ADMIN_PASSWORD." : "an undisclosed random password; configure DEFAULT_ADMIN_PASSWORD and use the secure recovery process."}`,
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
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS enabled_client_pages TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS free_trial_claimed BOOLEAN NOT NULL DEFAULT false;
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

      -- Mark existing companies that already have active subscriptions or custom quotas as having claimed free trial
      UPDATE companies
      SET free_trial_claimed = true
      WHERE (is_active = true OR monthly_token_quota > 25000 OR activation_end IS NOT NULL)
        AND free_trial_claimed = false;

      -- Sync Auto-Delete retention for companies on Professional Plan or Fairouz if set to legacy 30 days
      UPDATE companies
      SET chat_log_retention_days = 7
      WHERE (monthly_token_quota = 1000000 OR name ILIKE '%فيروز%' OR name ILIKE '%fairouz%')
        AND chat_log_retention_days = 30;

      UPDATE companies
      SET ai_model = 'nvidia/nemotron-3.5-lightning:free'
      WHERE ai_model = 'nvidia/nemotron-nano-9b-v2:free' OR ai_model LIKE '%nemotron-nano%';

      UPDATE admin_config
      SET value = 'nvidia/nemotron-3.5-lightning:free'
      WHERE (key = 'quota_ai_model' OR key = 'support_ai_model')
        AND (value = 'nvidia/nemotron-nano-9b-v2:free' OR value LIKE '%nemotron-nano%');
    `);

    // Ensure packages catalog in database includes the free_trial plan and synchronized token features
    try {
      const [catRow] = await db
        .select()
        .from(adminConfigTable)
        .where(eq(adminConfigTable.key, "packages_catalog"));

      if (catRow && catRow.value) {
        const parsed = JSON.parse(catRow.value);
        if (Array.isArray(parsed.packages)) {
          let modified = false;

          const hasFreeTrial = parsed.packages.some((p: any) => p.id === "free_trial");
          if (!hasFreeTrial) {
            const freeTrialPkg = DEFAULT_PACKAGES_CATALOG.packages.find((p) => p.id === "free_trial");
            if (freeTrialPkg) {
              parsed.packages = [freeTrialPkg, ...parsed.packages];
              modified = true;
            }
          }

          // Ensure plan tokens and feature strings are synchronized
          parsed.packages.forEach((pkg: any, idx: number) => {
            pkg.sortOrder = idx + 1;
            // Upgrade legacy default quotas to modern platform tiers if on old defaults
            if (pkg.id === "starter" && (pkg.tokensMonthly === 50000 || !pkg.tokensMonthly)) {
              pkg.tokensMonthly = 500000;
              pkg.tokensFormatted = "500,000";
              pkg.monthlyPriceUsd = 20;
              modified = true;
            } else if (pkg.id === "pro") {
              if (pkg.tokensMonthly === 250000 || !pkg.tokensMonthly) {
                pkg.tokensMonthly = 1000000;
                pkg.tokensFormatted = "1,000,000";
                pkg.monthlyPriceUsd = 25;
                modified = true;
              }
              if (pkg.retentionDays === 30 || pkg.retentionDays === undefined) {
                pkg.retentionDays = 7;
                modified = true;
              }
            } else if (pkg.id === "enterprise" && (pkg.tokensMonthly === 1000000 || !pkg.tokensMonthly)) {
              pkg.tokensMonthly = 1500000;
              pkg.tokensFormatted = "1,500,000";
              pkg.monthlyPriceUsd = 30;
              pkg.retentionDays = 14;
              modified = true;
            }

            // Sync features to match current tokensMonthly
            if (pkg.tokensMonthly) {
              const formatted = pkg.tokensFormatted || Number(pkg.tokensMonthly).toLocaleString();
              if (Array.isArray(pkg.featuresAr)) {
                pkg.featuresAr = pkg.featuresAr.map((f: string) => {
                  if (/[\d,kKmM.]+\s*(?:رمز شهرياً|رمز مجاني|رموز|رمز)/i.test(f)) {
                    modified = true;
                    return f.replace(/[\d,kKmM.]+\s*(رمز شهرياً \(AI Tokens\)|رمز مجاني \(AI Tokens\)|رمز شهرياً|رمز)/i, `${formatted} $1`);
                  }
                  return f;
                });
              }
              if (Array.isArray(pkg.featuresEn)) {
                pkg.featuresEn = pkg.featuresEn.map((f: string) => {
                  if (/[\d,kKmM.]+\s*(?:monthly AI Tokens|tokens?)/i.test(f)) {
                    modified = true;
                    return f.replace(/[\d,kKmM.]+\s*(monthly AI Tokens|tokens?)/i, `${formatted} $1`);
                  }
                  return f;
                });
              }
            }
          });

          if (modified) {
            parsed.updatedAt = new Date().toISOString();
            await db
              .update(adminConfigTable)
              .set({ value: JSON.stringify(parsed), updatedAt: new Date() })
              .where(eq(adminConfigTable.key, "packages_catalog"));
            logger.info("Auto-synced and updated packages catalog in database admin_config table");
          }
        }
      }
    } catch (catErr) {
      logger.warn({ err: catErr }, "Could not check or sync packages catalog into database");
    }

    logger.info("Data source permissions schema columns and model migrations ensured successfully");
  } catch (err) {
    logger.error({ err }, "Failed to ensure data source permissions schema columns");
  }
}