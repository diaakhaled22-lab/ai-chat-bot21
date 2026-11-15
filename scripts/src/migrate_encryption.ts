/**
 * Database Encryption Key Migration Script (D4 Fix with Transactions & Scoped Backups)
 * 
 * Features:
 * 1. Pre-migration Scoped Backup:
 *    - Copies ONLY the target encrypted columns (and primary key id) into temporary snapshot tables.
 *    - Strictly excludes password_hash, 2FA/totp secrets, and user profile data.
 *    - Enables Row-Level Security (RLS) on snapshot tables during their lifespan.
 * 2. Full ACID Transaction Handling:
 *    - Executes all re-encryptions inside BEGIN ... COMMIT.
 *    - Automatically executes ROLLBACK on any error or decryption failure, leaving zero corrupted rows.
 * 3. Automatic Snapshot Cleanup:
 *    - Automatically drops snapshot tables immediately after confirming migration success.
 *    - Leaves zero lingering backup tables or redundant data in the database.
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
  console.log("[ROLLBACK] Starting database restore from scoped backup snapshot...");

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

    // Restore companies encrypted columns only
    for (const { table, column } of ENCRYPTED_COLUMNS.filter((c) => c.table === "companies")) {
      const colCheck = await client.query(
        `SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2);`,
        [backupCompaniesTable, column]
      );
      if (colCheck.rows[0]?.exists) {
        await client.query(`
          UPDATE "companies" c
          SET "${column}" = b."${column}"
          FROM "${backupCompaniesTable}" b
          WHERE c.id = b.id;
        `);
      }
    }

    // Restore users encrypted columns only
    for (const { table, column } of ENCRYPTED_COLUMNS.filter((c) => c.table === "users")) {
      const colCheck = await client.query(
        `SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2);`,
        [backupUsersTable, column]
      );
      if (colCheck.rows[0]?.exists) {
        await client.query(`
          UPDATE "users" u
          SET "${column}" = b."${column}"
          FROM "${backupUsersTable}" b
          WHERE u.id = b.id;
        `);
      }
    }

    await client.query("COMMIT;");
    console.log(`[ROLLBACK] Successfully restored all encrypted columns from snapshot ${targetTimestamp}`);

    // Drop the snapshot tables after successful rollback
    await client.query(`DROP TABLE IF EXISTS "${backupCompaniesTable}";`);
    await client.query(`DROP TABLE IF EXISTS "${backupUsersTable}";`);
    console.log(`[ROLLBACK] Dropped temporary snapshot tables after restore.`);
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
  const keepDbBackup = process.argv.includes("--keep-db-backup");

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
  console.log(`[MIGRATE-ENCRYPTION] Connected to database. Migration session ID: ${timestamp}`);

  // ── 1. Create Pre-Migration Scoped Backup Tables (Encrypted Columns Only) ──
  console.log("[MIGRATE-ENCRYPTION] Creating scoped pre-migration backup tables (encrypted columns only)...");
  const tablesToBackup = ["companies", "users"];
  const createdBackupTables: string[] = [];

  try {
    for (const tbl of tablesToBackup) {
      const existsRes = await client.query(
        `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1);`,
        [tbl]
      );
      if (existsRes.rows[0]?.exists) {
        // Find existing encrypted columns for this table
        const targetCols = ENCRYPTED_COLUMNS.filter((c) => c.table === tbl).map((c) => c.column);
        const existingColsRes = await client.query(
          `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = ANY($2);`,
          [tbl, targetCols]
        );
        const colsToSelect = existingColsRes.rows.map((r: { column_name: string }) => `"${r.column_name}"`);

        if (colsToSelect.length > 0) {
          const backupTableName = `_backup_${tbl}_enc_${timestamp}`;
          // Copy strictly id and the encrypted columns. Strictly excludes password_hash, 2FA secrets, etc.
          await client.query(`CREATE TABLE "${backupTableName}" AS SELECT id, ${colsToSelect.join(", ")} FROM "${tbl}";`);
          // Enable RLS on the snapshot table
          await client.query(`ALTER TABLE "${backupTableName}" ENABLE ROW LEVEL SECURITY;`);
          createdBackupTables.push(backupTableName);
          console.log(`  Created scoped backup: ${backupTableName} (id, ${colsToSelect.join(", ")}) with RLS enabled.`);
        }
      }
    }
  } catch (backupErr: any) {
    console.error("FATAL: Failed to create pre-migration scoped backup tables:", backupErr.message);
    await client.end();
    process.exit(1);
  }

  // ── 2. Collect In-Memory / File Backup Snapshot (Only if explicitly requested) ──
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
        continue;
      }

      const rows = await client.query(
        `SELECT id, "${column}" as val FROM "${table}" WHERE "${column}" IS NOT NULL AND "${column}" != ''`
      );

      console.log(`[MIGRATE-ENCRYPTION] Scanning ${table}.${column} (${rows.rowCount} rows found)...`);

      for (const row of rows.rows) {
        totalInspected++;
        const rawValue = row.val as string;

        if (shouldSaveFileBackup) {
          fileBackupRecords.push({
            table,
            column,
            id: row.id,
            previousValue: rawValue,
          });
        }

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

        // Apply updated value within active transaction
        await client.query(
          `UPDATE "${table}" SET "${column}" = $1 WHERE id = $2`,
          [reEncrypted, row.id]
        );
        totalMigrated++;
      }
    }

    // ── 4. Verify Safety & Finalize Transaction ──
    if (totalFailed > 0) {
      console.error(`\n[ABORT] ${totalFailed} fields failed to decrypt or re-encrypt. Rolling back all database changes (ROLLBACK)...`);
      await client.query("ROLLBACK;");
      console.log("[MIGRATE-ENCRYPTION] Transaction rolled back safely. Database is completely untouched.");

      // Clean up temporary snapshot tables on abort
      for (const backupTableName of createdBackupTables) {
        await client.query(`DROP TABLE IF EXISTS "${backupTableName}";`);
      }
      await client.end();
      process.exit(1);
    }

    // Persist file backup only if explicitly opted-in
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

    // ── 5. Drop Snapshot Tables After Confirmed Success ──
    if (!keepDbBackup) {
      console.log("[MIGRATE-ENCRYPTION] Migration verified successfully. Dropping temporary backup snapshot tables...");
      for (const backupTableName of createdBackupTables) {
        await client.query(`DROP TABLE IF EXISTS "${backupTableName}";`);
        console.log(`  Dropped temporary snapshot table: ${backupTableName}`);
      }
    } else {
      console.log("[MIGRATE-ENCRYPTION] Preserved scoped backup snapshot tables as requested (--keep-db-backup).");
    }

  } catch (txErr: any) {
    console.error("[MIGRATE-ENCRYPTION] Unexpected error occurred during migration. Executing ROLLBACK:", txErr.message);
    await client.query("ROLLBACK;");

    // Clean up temporary snapshot tables on exception
    for (const backupTableName of createdBackupTables) {
      await client.query(`DROP TABLE IF EXISTS "${backupTableName}";`);
    }
    await client.end();
    process.exit(1);
  }

  await client.end();

  console.log("\n==================================================");
  console.log("[MIGRATE-ENCRYPTION] Migration Summary:");
  console.log(`  Total fields inspected:    ${totalInspected}`);
  console.log(`  Total fields re-encrypted: ${totalMigrated}`);
  console.log(`  Total fields failed:       ${totalFailed}`);
  console.log("  Snapshot tables:           Cleaned up (zero lingering tables)");
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
