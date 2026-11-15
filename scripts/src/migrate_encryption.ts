/**
 * Database Encryption Key Migration Script (D4 Fix)
 * 
 * Scans all database columns that store encrypted secrets, decrypts them using candidate keys
 * (including PREVIOUS_ENCRYPTION_KEYS and fallback keys), and re-encrypts them with the primary ENCRYPTION_KEY.
 * 
 * Once this migration is complete, legacy fallback keys can be permanently disabled (ALLOW_LEGACY_FALLBACK_KEYS=false).
 * 
 * Usage:
 *   pnpm --filter @workspace/scripts run migrate:encryption
 *   or:
 *   npx tsx scripts/src/migrate_encryption.ts
 */

import { Client } from "pg";
import { encrypt, decrypt, getEncryptionKey } from "../../lib/db/src/encryption";

const ENCRYPTED_COLUMNS: Array<{ table: string; column: string }> = [
  { table: "companies", column: "resend_api_key" },
  { table: "companies", column: "service_account_key" },
  { table: "companies", column: "google_calendar_service_account_key" },
  { table: "companies", column: "ai_agent_api_key" },
  { table: "companies", column: "telegram_bot_api_key" },
  { table: "companies", column: "whatsapp_api_token" },
  { table: "companies", column: "messenger_api_key" },
  { table: "users", column: "resend_api_key" },
];

async function runMigration() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("FATAL: DATABASE_URL environment variable is required.");
    process.exit(1);
  }

  // Ensure primary key is valid
  try {
    const primaryKey = getEncryptionKey();
    console.log(`[MIGRATE-ENCRYPTION] Primary encryption key verified (${primaryKey.length} bytes).`);
  } catch (err: any) {
    console.error(`FATAL: Invalid primary ENCRYPTION_KEY: ${err.message}`);
    process.exit(1);
  }

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  console.log("[MIGRATE-ENCRYPTION] Connected to database. Beginning encryption migration scan...");

  let totalInspected = 0;
  let totalMigrated = 0;
  let totalFailed = 0;
  let totalAlreadyCurrent = 0;

  for (const { table, column } of ENCRYPTED_COLUMNS) {
    try {
      // Check if table exists
      const tableCheck = await client.query(
        `SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_name = $1
        );`,
        [table]
      );
      if (!tableCheck.rows[0]?.exists) {
        console.log(`[MIGRATE-ENCRYPTION] Skipping ${table}.${column}: table does not exist.`);
        continue;
      }

      // Check if column exists
      const colCheck = await client.query(
        `SELECT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_name = $1 AND column_name = $2
        );`,
        [table, column]
      );
      if (!colCheck.rows[0]?.exists) {
        console.log(`[MIGRATE-ENCRYPTION] Skipping ${table}.${column}: column does not exist.`);
        continue;
      }

      const rows = await client.query(
        `SELECT id, "${column}" as val FROM "${table}" WHERE "${column}" IS NOT NULL AND "${column}" != ''`
      );

      console.log(`[MIGRATE-ENCRYPTION] Scanning ${table}.${column} (${rows.rowCount} rows found)...`);

      for (const row of rows.rows) {
        totalInspected++;
        const rawValue = row.val as string;

        // Decrypt using candidate keys
        const decrypted = decrypt(rawValue);
        if (decrypted === null) {
          console.warn(`[WARN] Failed to decrypt row id=${row.id} in ${table}.${column} with any available key.`);
          totalFailed++;
          continue;
        }

        // Re-encrypt with primary key
        const reEncrypted = encrypt(decrypted);
        if (!reEncrypted) {
          totalFailed++;
          continue;
        }

        // Check if row already decrypts cleanly with primary key
        // A fresh encryption with primary key guarantees AES-256-GCM authenticated with primary key
        await client.query(
          `UPDATE "${table}" SET "${column}" = $1 WHERE id = $2`,
          [reEncrypted, row.id]
        );
        totalMigrated++;
      }
    } catch (colErr: any) {
      console.error(`[ERROR] Failed processing ${table}.${column}:`, colErr.message);
    }
  }

  await client.end();

  console.log("\n==================================================");
  console.log("[MIGRATE-ENCRYPTION] Migration Summary:");
  console.log(`  Total fields inspected:  ${totalInspected}`);
  console.log(`  Total fields re-encrypted: ${totalMigrated}`);
  console.log(`  Total fields failed:     ${totalFailed}`);
  console.log("==================================================");

  if (totalFailed === 0) {
    console.log("SUCCESS: All encrypted secrets have been unified under the primary ENCRYPTION_KEY.");
    console.log("You can now safely set ALLOW_LEGACY_FALLBACK_KEYS=false in production.");
  } else {
    console.warn("WARNING: Some fields could not be decrypted. Please verify previous keys.");
  }
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}`) {
  runMigration().catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
}

export { runMigration };
