/**
 * Database Encryption Key Migration Script (D4 Fix with Transactions & Backups)
 * 
 * Features:
 * 1. Pre-migration Automated Backup:
 *    - Creates timestamped database snapshot tables (e.g. `_backup_companies_enc_<timestamp>`)
 *    - Saves a local JSON snapshot backup in `scripts/backups/`
 * 2. Full ACID Transaction Handling:
 *    - Executes all re-encryptions inside `BEGIN ... COMMIT`
 *    - Automatically executes `ROLLBACK` on any error or decryption failure, leaving zero corrupted rows.
 * 3. Rollback Support:
 *    - Run with `--rollback` or `--rollback <timestamp>` to restore data from backup tables.
 * 
 * Usage:
 *   pnpm --filter @workspace/scripts run migrate:encryption
 *   pnpm --filter @workspace/scripts run migrate:encryption -- --rollback
 */

import fs from "fs";
import path from "path";
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

interface BackupRecord {
  table: string;
  column: string;
  id: number | string;
  previousValue: string;
}

async function runRollback(client: Client, backupTimestamp?: string) {
  console.log("[ROLLBACK] Starting database restore from backup snapshot...");

  // Find available backup tables if timestamp not specified
  let targetTimestamp = backupTimestamp;
  if (!targetTimestamp) {
    const tableRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name LIKE '_backup_companies_enc_%'
      ORDER BY table_name DESC 
      LIMIT 1;
    `);
    if (tableRes.rows.length === 0) {
      throw new Error("No backup snapshot tables found in database to roll back from.");
    }
    targetTimestamp = tableRes.rows[0].table_name.replace("_backup_companies_enc_", "");
  }

  console.log(`[ROLLBACK] Restoring from snapshot timestamp: ${targetTimestamp}`);

  await client.query("BEGIN;");
  try {
    const backupCompaniesTable = `_backup_companies_enc_${targetTimestamp}`;
    const backupUsersTable = `_backup_users_enc_${targetTimestamp}`;

    // Restore companies encrypted columns
    for (const { table, column } of ENCRYPTED_COLUMNS.filter((c) => c.table === "companies")) {
      await client.query(`
        UPDATE "companies" c
        SET "${column}" = b."${column}"
        FROM "${backupCompaniesTable}" b
        WHERE c.id = b.id;
      `);
    }

    // Restore users encrypted columns
    for (const { table, column } of ENCRYPTED_COLUMNS.filter((c) => c.table === "users")) {
      await client.query(`
        UPDATE "users" u
        SET "${column}" = b."${column}"
        FROM "${backupUsersTable}" b
        WHERE u.id = b.id;
      `);
    }

    await client.query("COMMIT;");
    console.log(`[ROLLBACK] Successfully restored all encrypted columns from snapshot ${targetTimestamp}`);
  } catch (err) {
    await client.query("ROLLBACK;");
    throw err;
  }
}

async function runMigration() {
  const isRollback = process.argv.includes("--rollback");
  const rollbackIdx = process.argv.indexOf("--rollback");
  const rollbackTimestampArg = rollbackIdx !== -1 && process.argv[rollbackIdx + 1] && !process.argv[rollbackIdx + 1].startsWith("--")
    ? process.argv[rollbackIdx + 1]
    : undefined;

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("FATAL: DATABASE_URL environment variable is required.");
    process.exit(1);
  }

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  if (isRollback) {
    try {
      await runRollback(client, rollbackTimestampArg);
      await client.end();
      process.exit(0);
    } catch (err: any) {
      console.error("FATAL: Rollback failed:", err.message);
      await client.end();
      process.exit(1);
    }
  }

  // Ensure primary key is valid
  try {
    const primaryKey = getEncryptionKey();
    console.log(`[MIGRATE-ENCRYPTION] Primary encryption key verified (${primaryKey.length} bytes).`);
  } catch (err: any) {
    console.error(`FATAL: Invalid primary ENCRYPTION_KEY: ${err.message}`);
    await client.end();
    process.exit(1);
  }

  const timestamp = Date.now().toString();
  console.log(`[MIGRATE-ENCRYPTION] Connected to database. Snapshot ID: ${timestamp}`);

  // ── 1. Create Pre-Migration Backup Snapshot Tables ──
  console.log("[MIGRATE-ENCRYPTION] Creating pre-migration database snapshot tables...");
  try {
    const tablesToBackup = ["companies", "users"];
    for (const tbl of tablesToBackup) {
      const existsRes = await client.query(
        `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1);`,
        [tbl]
      );
      if (existsRes.rows[0]?.exists) {
        const backupTableName = `_backup_${tbl}_enc_${timestamp}`;
        await client.query(`CREATE TABLE "${backupTableName}" AS SELECT * FROM "${tbl}";`);
        console.log(`  Created database backup table: ${backupTableName}`);
      }
    }
  } catch (backupErr: any) {
    console.error("FATAL: Failed to create pre-migration database backup tables:", backupErr.message);
    await client.end();
    process.exit(1);
  }

  // ── 2. Collect In-Memory / File Backup Snapshot ──
  const fileBackupRecords: BackupRecord[] = [];
  const shouldSaveFileBackup = process.argv.includes("--save-file-backup");
  const backupDir = path.resolve(process.cwd(), "scripts", "backups");
  if (shouldSaveFileBackup && !fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
    fs.writeFileSync(path.join(backupDir, ".gitignore"), "*\n!.gitignore\n", "utf-8");
  }

  // ── 3. Execute Migration within an ACID Transaction ──
  console.log("[MIGRATE-ENCRYPTION] Beginning atomic migration transaction (BEGIN)...");
  await client.query("BEGIN;");

  let totalInspected = 0;
  let totalMigrated = 0;
  let totalFailed = 0;

  try {
    for (const { table, column } of ENCRYPTED_COLUMNS) {
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

        // Save to file backup snapshot
        fileBackupRecords.push({
          table,
          column,
          id: row.id,
          previousValue: rawValue,
        });

        // Decrypt using candidate keys
        const decrypted = decrypt(rawValue);
        if (decrypted === null) {
          console.error(`[ERROR] Decryption FAILED for row id=${row.id} in ${table}.${column}. Aborting migration.`);
          totalFailed++;
          continue;
        }

        // Re-encrypt with primary key
        const reEncrypted = encrypt(decrypted);
        if (!reEncrypted) {
          console.error(`[ERROR] Re-encryption FAILED for row id=${row.id} in ${table}.${column}.`);
          totalFailed++;
          continue;
        }

        // Apply updated value within the active transaction
        await client.query(
          `UPDATE "${table}" SET "${column}" = $1 WHERE id = $2`,
          [reEncrypted, row.id]
        );
        totalMigrated++;
      }
    }

    // ── 4. Verify Transaction Safety & Finalize ──
    if (totalFailed > 0) {
      console.error(`\n[ABORT] ${totalFailed} fields failed to decrypt or re-encrypt. Rolling back all database changes (ROLLBACK)...`);
      await client.query("ROLLBACK;");
      console.log("[MIGRATE-ENCRYPTION] Transaction rolled back safely. Database is completely untouched.");
      await client.end();
      process.exit(1);
    }

    // Persist file backup only if explicitly opted-in (with restrictive permissions 0o600 and .gitignore protection)
    if (shouldSaveFileBackup) {
      const backupFilePath = path.join(backupDir, `encryption_backup_${timestamp}.json`);
      fs.writeFileSync(backupFilePath, JSON.stringify({ timestamp, records: fileBackupRecords }, null, 2), {
        encoding: "utf-8",
        mode: 0o600,
      });
      console.log(`[MIGRATE-ENCRYPTION] Local backup file saved to: ${backupFilePath}`);
    }

    // Commit transaction
    await client.query("COMMIT;");
    console.log("[MIGRATE-ENCRYPTION] Transaction committed successfully (COMMIT).");

  } catch (txErr: any) {
    console.error("[MIGRATE-ENCRYPTION] Unexpected error occurred during migration. Executing ROLLBACK:", txErr.message);
    await client.query("ROLLBACK;");
    await client.end();
    process.exit(1);
  }

  await client.end();

  console.log("\n==================================================");
  console.log("[MIGRATE-ENCRYPTION] Migration Summary:");
  console.log(`  Total fields inspected:    ${totalInspected}`);
  console.log(`  Total fields re-encrypted: ${totalMigrated}`);
  console.log(`  Total fields failed:       ${totalFailed}`);
  console.log(`  Database backup snapshot:  _backup_*_enc_${timestamp}`);
  console.log("==================================================");
  console.log("SUCCESS: All encrypted secrets have been re-encrypted with primary ENCRYPTION_KEY.");
  console.log("You can now safely set ALLOW_LEGACY_FALLBACK_KEYS=false in production.");
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}`) {
  runMigration().catch((err) => {
    console.error("Migration fatal error:", err);
    process.exit(1);
  });
}

export { runMigration, runRollback };
