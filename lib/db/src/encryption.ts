import crypto from "crypto";
import { customType } from "drizzle-orm/pg-core";

const ALGORITHM = "aes-256-gcm";

let lastDecryptionErrorTime = 0;
const DECRYPTION_ERROR_THROTTLE_MS = 60_000; // Log at most once per minute

// Generate or retrieve a consistent 32-byte encryption key
export function getEncryptionKey(): Buffer {
  const envKey = process.env.ENCRYPTION_KEY;
  
  if (envKey) {
    // Reject placeholder values in production
    const lowerKey = envKey.toLowerCase();
    if (
      process.env.NODE_ENV === "production" &&
      (lowerKey.startsWith("replace_with") || lowerKey === "change_me" || lowerKey === "your_key_here")
    ) {
      throw new Error(
        "FATAL SECURITY ERROR: ENCRYPTION_KEY contains a placeholder value. " +
        "Please generate a real key: openssl rand -hex 32"
      );
    }
    if (envKey.length === 64) return Buffer.from(envKey, "hex"); // 32 bytes in hex
    if (envKey.length === 32) return Buffer.from(envKey, "utf-8"); // 32 bytes plain
    // Hash it to exactly 32 bytes if it doesn't match standard lengths
    return crypto.createHash("sha256").update(envKey).digest();
  }

  // In production, ENCRYPTION_KEY is mandatory — no fallbacks
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "FATAL SECURITY ERROR: ENCRYPTION_KEY environment variable is required in production. " +
      "Generate one with: openssl rand -hex 32"
    );
  }

  // Non-production fallback for dev/test convenience
  const fallbackSource = process.env.DATABASE_URL || process.env.SESSION_SECRET || "dev-only-insecure-fallback";
  return crypto.createHash("sha256").update(fallbackSource).digest();
}

/**
 * Returns a deduplicated list of candidate keys to attempt during decryption.
 * This ensures seamless key rotation and backward compatibility across environment changes
 * (e.g. adding ENCRYPTION_KEY, switching DATABASE_URL, or rotating secrets) without data loss.
 */
export function getDecryptionKeys(): Buffer[] {
  const keys: Buffer[] = [];
  const seen = new Set<string>();

  const addKey = (buf: Buffer | null | undefined) => {
    if (!buf || buf.length !== 32) return;
    const hex = buf.toString("hex");
    if (!seen.has(hex)) {
      seen.add(hex);
      keys.push(buf);
    }
  };

  // 1. Primary key (whatever getEncryptionKey currently derives)
  try {
    addKey(getEncryptionKey());
  } catch {}

  // 2. Candidate from ENCRYPTION_KEY in various formats
  const envKey = process.env.ENCRYPTION_KEY;
  if (envKey) {
    if (envKey.length === 64) {
      try { addKey(Buffer.from(envKey, "hex")); } catch {}
    }
    if (envKey.length === 32) {
      addKey(Buffer.from(envKey, "utf-8"));
    }
    addKey(crypto.createHash("sha256").update(envKey).digest());
  }

  // 3. Candidate from DATABASE_URL (the historic default before explicit ENCRYPTION_KEY)
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) {
    addKey(crypto.createHash("sha256").update(dbUrl).digest());
    // Also try without query parameters (e.g. ?sslmode=require) in case URL was modified
    const dbUrlNoQuery = dbUrl.split("?")[0];
    if (dbUrlNoQuery && dbUrlNoQuery !== dbUrl) {
      addKey(crypto.createHash("sha256").update(dbUrlNoQuery).digest());
    }
    // Also try swapping postgresql:// vs postgres://
    if (dbUrl.startsWith("postgresql://")) {
      addKey(crypto.createHash("sha256").update(dbUrl.replace(/^postgresql:/, "postgres:")).digest());
    } else if (dbUrl.startsWith("postgres://")) {
      addKey(crypto.createHash("sha256").update(dbUrl.replace(/^postgres:/, "postgresql:")).digest());
    }
  }

  // 4. Candidate from SESSION_SECRET
  const sessionSecret = process.env.SESSION_SECRET;
  if (sessionSecret) {
    if (sessionSecret.length === 64) {
      try { addKey(Buffer.from(sessionSecret, "hex")); } catch {}
    }
    if (sessionSecret.length === 32) {
      addKey(Buffer.from(sessionSecret, "utf-8"));
    }
    addKey(crypto.createHash("sha256").update(sessionSecret).digest());
  }

  // 5. Candidate from PREVIOUS_ENCRYPTION_KEYS / OLD_ENCRYPTION_KEY (comma-separated list for key rotation)
  const previousKeys = (process.env.PREVIOUS_ENCRYPTION_KEYS || process.env.OLD_ENCRYPTION_KEY || "").split(",");
  for (const raw of previousKeys) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (trimmed.length === 64) {
      try { addKey(Buffer.from(trimmed, "hex")); } catch {}
    }
    if (trimmed.length === 32) {
      addKey(Buffer.from(trimmed, "utf-8"));
    }
    addKey(crypto.createHash("sha256").update(trimmed).digest());
  }

  // 6. Candidate from REPL_ID (Replit environment identifier)
  if (process.env.REPL_ID) {
    addKey(crypto.createHash("sha256").update(process.env.REPL_ID).digest());
  }

  // 7. Legacy fallback constants (kept for backward-compatible decryption of old data)
  addKey(crypto.createHash("sha256").update("dev-only-insecure-fallback").digest());
  addKey(crypto.createHash("sha256").update("default-unsafe-production-key").digest());
  addKey(crypto.createHash("sha256").update("default-unsafe-fallback-key").digest());

  return keys;
}

export function encrypt(text: string | null | undefined): string | null {
  if (!text) return text as any;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  
  // Prefix with 'enc:' to identify encrypted strings
  return `enc:${iv.toString("hex")}:${authTag}:${encrypted}`;
}

export function decrypt(text: string | null | undefined): string | null {
  if (!text) return text as any;
  
  // Check if it's actually encrypted (backward compatibility with existing plain text keys)
  if (!text.startsWith("enc:")) {
    return text;
  }
  
  const parts = text.split(":");
  if (parts.length !== 4) {
    console.error("Malformed encrypted field format (expected 4 parts)");
    return null;
  }
  
  const [_, ivHex, authTagHex, encryptedHex] = parts;
  if (!ivHex || !authTagHex || encryptedHex === undefined) {
    return null;
  }

  let iv: Buffer;
  let authTag: Buffer;
  try {
    iv = Buffer.from(ivHex, "hex");
    authTag = Buffer.from(authTagHex, "hex");
    if (iv.length !== 12 || authTag.length !== 16) {
      return null;
    }
  } catch {
    return null;
  }

  // Attempt decryption against all candidate keys in order
  const candidateKeys = getDecryptionKeys();
  for (const key of candidateKeys) {
    try {
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(encryptedHex, "hex", "utf8");
      decrypted += decipher.final("utf8");
      return decrypted;
    } catch {
      // Key mismatch or invalid tag: continue to next candidate key
    }
  }

  // Throttle warning log to prevent flooding server logs on multiple records
  const now = Date.now();
  if (now - lastDecryptionErrorTime > DECRYPTION_ERROR_THROTTLE_MS) {
    lastDecryptionErrorTime = now;
    console.warn(
      "[ENCRYPTION] Failed to decrypt field (invalid key or tampered data). " +
      "If you changed ENCRYPTION_KEY or DATABASE_URL, please set ENCRYPTION_KEY to match the original key, " +
      "or re-save the affected credentials in the dashboard."
    );
  }

  // Fail closed: return null instead of leaking raw ciphertext
  return null;
}

// Custom Drizzle Type for Encrypted Columns
export const encryptedText = customType<{ data: string; driverData: string }>({
  dataType() {
    return "text"; // Maps to PostgreSQL 'text' column
  },
  toDriver(value: string): string {
    return encrypt(value) ?? "";
  },
  fromDriver(value: string): string {
    return decrypt(value) ?? "";
  },
});

export const searchableText = customType<{ data: string; driverData: string }>({
  dataType() {
    return "text";
  },
  toDriver(value: string): string {
    return value;
  },
  fromDriver(value: string): string {
    return decrypt(value) ?? "";
  },
});
