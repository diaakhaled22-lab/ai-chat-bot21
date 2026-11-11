import crypto from "crypto";
import { customType } from "drizzle-orm/pg-core";

const ALGORITHM = "aes-256-gcm";

// Generate or retrieve a consistent 32-byte encryption key
function getEncryptionKey(): Buffer {
  const envKey = process.env.ENCRYPTION_KEY;
  if (envKey) {
    if (envKey.length === 64) return Buffer.from(envKey, "hex"); // 32 bytes in hex
    if (envKey.length === 32) return Buffer.from(envKey, "utf-8"); // 32 bytes plain
    // Hash it to exactly 32 bytes if it doesn't match standard lengths
    return crypto.createHash('sha256').update(envKey).digest();
  }
  
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "FATAL SECURITY ERROR: ENCRYPTION_KEY environment variable is required in production. " +
      "Refusing to derive encryption key from DATABASE_URL. Please configure ENCRYPTION_KEY."
    );
  }

  // Fallback ONLY in non-production environments with a prominent warning
  console.warn(
    "[SECURITY WARNING] ENCRYPTION_KEY is not set. Using insecure fallback derived from DATABASE_URL. " +
    "Set ENCRYPTION_KEY in production to protect stored secrets."
  );
  const fallbackSource = process.env.DATABASE_URL || "default-unsafe-fallback-key";
  return crypto.createHash('sha256').update(fallbackSource).digest();
}

export function encrypt(text: string | null | undefined): string | null {
  if (!text) return text as any;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  
  // Prefix with 'enc:' to identify encrypted strings
  return `enc:${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decrypt(text: string | null | undefined): string | null {
  if (!text) return text as any;
  
  // Check if it's actually encrypted (backward compatibility with existing plain text keys)
  if (!text.startsWith("enc:")) {
    return text;
  }
  
  try {
    const parts = text.split(':');
    if (parts.length !== 4) {
      console.error("Malformed encrypted field format (expected 4 parts)");
      return null;
    }
    
    const [_, ivHex, authTagHex, encryptedHex] = parts;
    const decipher = crypto.createDecipheriv(
      ALGORITHM, 
      getEncryptionKey(), 
      Buffer.from(ivHex, 'hex')
    );
    
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error("Failed to decrypt field (invalid key or tampered data)");
    // Fail closed: return null instead of leaking raw ciphertext
    return null;
  }
}

// Custom Drizzle Type for Encrypted Columns
export const encryptedText = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'text'; // Maps to PostgreSQL 'text' column
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
    return 'text';
  },
  toDriver(value: string): string {
    return value;
  },
  fromDriver(value: string): string {
    return decrypt(value) ?? "";
  },
});
