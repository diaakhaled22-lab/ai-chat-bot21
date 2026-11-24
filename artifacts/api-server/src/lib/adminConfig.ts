import {
  db,
  adminConfigTable,
  encryptAdminConfigValue,
  decryptAdminConfigValue,
  isSensitiveAdminConfigKey,
  encrypt,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Fetches config rows from admin_config and transparently decrypts sensitive values (H6 fix).
 */
export async function getAdminConfigMap(keys?: string[]): Promise<Map<string, string>> {
  const rows = keys && keys.length > 0
    ? await db.select().from(adminConfigTable).where(inArray(adminConfigTable.key, keys))
    : await db.select().from(adminConfigTable);

  return new Map(rows.map((r) => [r.key, decryptAdminConfigValue(r.key, r.value)]));
}

/**
 * Fetches a single entry from admin_config, decrypting sensitive values automatically.
 */
export async function getAdminConfigEntry(key: string): Promise<{ value: string | null; updatedAt: Date | null }> {
  const [row] = await db
    .select()
    .from(adminConfigTable)
    .where(eq(adminConfigTable.key, key))
    .limit(1);

  if (!row) {
    return { value: null, updatedAt: null };
  }

  return {
    value: row.value ? decryptAdminConfigValue(key, row.value) : row.value,
    updatedAt: row.updatedAt ?? null,
  };
}

/**
 * Inserts or updates an admin_config entry, encrypting sensitive secrets before storage (H6 fix).
 */
export async function upsertAdminConfig(key: string, value: string): Promise<void> {
  const storedValue = encryptAdminConfigValue(key, value) ?? "";
  await db
    .insert(adminConfigTable)
    .values({ key, value: storedValue })
    .onConflictDoUpdate({
      target: adminConfigTable.key,
      set: { value: storedValue, updatedAt: new Date() },
    });
}

/**
 * Scans admin_config on startup and encrypts any legacy plaintext secrets in place (H6 fix).
 * Only touches rows that are unencrypted (do not carry the 'enc:' prefix).
 */
export async function encryptPlaintextAdminConfigSecrets(): Promise<number> {
  const rows = await db.select().from(adminConfigTable);
  let migrated = 0;

  for (const row of rows) {
    if (!row.value || !isSensitiveAdminConfigKey(row.key)) continue;
    if (row.value.startsWith("enc:")) continue;

    const encryptedValue = encrypt(row.value);
    if (!encryptedValue) continue;

    await db
      .update(adminConfigTable)
      .set({ value: encryptedValue, updatedAt: new Date() })
      .where(and(eq(adminConfigTable.key, row.key), eq(adminConfigTable.value, row.value)));
    migrated++;
  }

  if (migrated > 0) {
    logger.info({ count: migrated }, "Encrypted legacy plaintext secrets in admin_config");
  }

  return migrated;
}
