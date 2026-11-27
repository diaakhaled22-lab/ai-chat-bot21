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
 * Encrypts a single legacy plaintext sensitive secret in admin_config in-place.
 * Uses conditional update (matching both key and original plaintext value) to avoid overwriting concurrent updates.
 */
async function healPlaintextAdminConfigRow(key: string, value: string, source: "startup" | "read"): Promise<boolean> {
  if (!value || !isSensitiveAdminConfigKey(key) || value.startsWith("enc:")) {
    return false;
  }

  const encryptedValue = encrypt(value);
  if (!encryptedValue || !encryptedValue.startsWith("enc:")) {
    throw new Error(`Failed to encrypt legacy plaintext secret for admin_config key '${key}'`);
  }

  await db
    .update(adminConfigTable)
    .set({ value: encryptedValue, updatedAt: new Date() })
    .where(and(eq(adminConfigTable.key, key), eq(adminConfigTable.value, value)));

  if (source === "read") {
    logger.warn({ key }, "Encrypted legacy plaintext secret found on read in admin_config");
  }
  return true;
}

/**
 * Fetches config rows from admin_config and transparently decrypts sensitive values (H6 fix).
 * Also heals any legacy plaintext sensitive secrets in-place on read.
 */
export async function getAdminConfigMap(keys?: string[]): Promise<Map<string, string>> {
  const rows = keys && keys.length > 0
    ? await db.select().from(adminConfigTable).where(inArray(adminConfigTable.key, keys))
    : await db.select().from(adminConfigTable);

  for (const row of rows) {
    if (row.value && isSensitiveAdminConfigKey(row.key) && !row.value.startsWith("enc:")) {
      await healPlaintextAdminConfigRow(row.key, row.value, "read");
    }
  }

  return new Map(rows.map((r) => [r.key, decryptAdminConfigValue(r.key, r.value)]));
}

/**
 * Fetches a single entry from admin_config, decrypting sensitive values automatically
 * and healing any legacy plaintext sensitive value in-place on read.
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

  if (row.value && isSensitiveAdminConfigKey(key) && !row.value.startsWith("enc:")) {
    await healPlaintextAdminConfigRow(key, row.value, "read");
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
    if (await healPlaintextAdminConfigRow(row.key, row.value ?? "", "startup")) {
      migrated++;
    }
  }

  if (migrated > 0) {
    logger.info({ count: migrated }, "Encrypted legacy plaintext secrets in admin_config");
  }

  return migrated;
}
