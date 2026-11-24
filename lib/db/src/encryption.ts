import crypto from "crypto";
import { customType } from "drizzle-orm/pg-core";

const ALGORITHM = "aes-256-gcm";

let lastDecryptionErrorTime = 0;
const DECRYPTION_ERROR_THROTTLE_MS = 60_000; // Log at most once per minute

const PLACEHOLDER_KEY_PATTERN = /^(replace_with|change_me|your_secret_here|your_key_here)/i;

function isPlaceholderKey(raw: string): boolean {
  return PLACEHOLDER_KEY_PATTERN.test(raw.trim());
}

function deriveKeyFromSecret(raw: string): Buffer {
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
  if (Buffer.byteLength(raw, "utf-8") === 32) return Buffer.from(raw, "utf-8");
  return crypto.createHash("sha256").update(raw).digest();
}

function addSecretCandidates(raw: string, addKey: (buf: Buffer | null | undefined) => void): void {
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    try { addKey(Buffer.from(raw, "hex")); } catch {}
  }
  if (Buffer.byteLength(raw, "utf-8") === 32) {
    addKey(Buffer.from(raw, "utf-8"));
  }
  addKey(crypto.createHash("sha256").update(raw).digest());
}

// Generate or retrieve a consistent 32-byte encryption key
export function getEncryptionKey(): Buffer {
  const envKey = process.env.ENCRYPTION_KEY?.trim();

  if (envKey) {
    // Reject placeholder values in production
    if (process.env.NODE_ENV === "production" && isPlaceholderKey(envKey)) {
      throw new Error(
        "FATAL SECURITY ERROR: ENCRYPTION_KEY contains a placeholder value. " +
        "Please generate a real key: openssl rand -hex 32"
      );
    }
    if (process.env.NODE_ENV === "production" || !isPlaceholderKey(envKey)) {
      return deriveKeyFromSecret(envKey);
    }
  }

  // In production, ENCRYPTION_KEY is mandatory — no fallbacks
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "FATAL SECURITY ERROR: ENCRYPTION_KEY environment variable is required in production. " +
      "Generate one with: openssl rand -hex 32"
    );
  }

  // Non-production fallback for dev/test convenience only
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
  const isProd = process.env.NODE_ENV === "production";

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

  // 2. Candidate from ENCRYPTION_KEY in various formats (reject placeholders in production)
  const envKey = process.env.ENCRYPTION_KEY?.trim();
  if (envKey && !(isProd && isPlaceholderKey(envKey))) {
    addSecretCandidates(envKey, addKey);
  }

  // 3. Explicit key rotation via PREVIOUS_ENCRYPTION_KEYS / OLD_ENCRYPTION_KEY (comma-separated list)
  const previousKeys = (process.env.PREVIOUS_ENCRYPTION_KEYS || process.env.OLD_ENCRYPTION_KEY || "").split(",");
  for (const raw of previousKeys) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    addSecretCandidates(trimmed, addKey);
  }

  // 4. In development, testing, or when ALLOW_LEGACY_FALLBACK_KEYS="true" is explicitly set:
  // Allow candidates from DATABASE_URL, SESSION_SECRET, and REPL_ID (X1/D4 fix)
  const allowLegacy = !isProd || process.env.ALLOW_LEGACY_FALLBACK_KEYS === "true";

  if (isProd && process.env.ALLOW_LEGACY_FALLBACK_KEYS === "true") {
    console.warn(
      "[SECURITY DEPRECATION] ALLOW_LEGACY_FALLBACK_KEYS=true is enabled in production. " +
      "Run 'pnpm run db:migrate-encryption' to unify all encrypted data under ENCRYPTION_KEY, " +
      "then unset ALLOW_LEGACY_FALLBACK_KEYS."
    );
  }

  if (allowLegacy) {
    // Historic candidate from DATABASE_URL
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

    // Candidate from SESSION_SECRET
    const sessionSecret = process.env.SESSION_SECRET;
    if (sessionSecret) {
      addSecretCandidates(sessionSecret, addKey);
    }

    // Candidate from REPL_ID (Replit environment identifier)
    if (process.env.REPL_ID) {
      addKey(crypto.createHash("sha256").update(process.env.REPL_ID).digest());
    }

    // Static fallback constants are strictly forbidden in production (X1)
    if (!isProd) {
      addKey(crypto.createHash("sha256").update("dev-only-insecure-fallback").digest());
      addKey(crypto.createHash("sha256").update("default-unsafe-fallback-key").digest());
    }
  }

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

export const SENSITIVE_ADMIN_CONFIG_KEYS = new Set<string>([
  "resend_api_key",
  "notif_smtp_pass",
  "support_ai_api_key",
  "quota_ai_api_key",
  "malfunctions_ai_api_key",
  "jwt_secret",
  "meta_app_secret",
  "whatsapp_api_token",
  "whatsapp_verify_token",
  "messenger_verify_token",
  "turnstile_secret_key",
  "hcaptcha_secret_key",
  "recaptcha_secret_key",
]);

/**
 * Returns true if the given admin_config key holds a sensitive credential or secret
 * that must be encrypted at rest (H6 fix).
 */
export function isSensitiveAdminConfigKey(key: string): boolean {
  return SENSITIVE_ADMIN_CONFIG_KEYS.has(key) || key.startsWith("ai_test_key_");
}

/**
 * Encrypts sensitive admin_config values before storage while leaving non-sensitive settings untouched.
 */
export function encryptAdminConfigValue(key: string, value: string | null | undefined): string | null | undefined {
  if (!value || !isSensitiveAdminConfigKey(key)) return value;
  if (value.startsWith("enc:") && decrypt(value) !== null) {
    return value;
  }
  return encrypt(value);
}

/**
 * Decrypts sensitive admin_config values on read, transparently supporting legacy plaintext rows until migrated.
 */
export function decryptAdminConfigValue(key: string, value: string | null | undefined): string {
  if (!value) return "";
  if (!isSensitiveAdminConfigKey(key)) return value;
  return decrypt(value) ?? "";
}
