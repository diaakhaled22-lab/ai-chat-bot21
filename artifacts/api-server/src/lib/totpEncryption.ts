import crypto from "node:crypto";

const VERSION = "v2";
const MIN_KEY_LENGTH = 32;

function getEncryptionKey(secret = process.env.TOTP_ENCRYPTION_KEY): Buffer {
  if (!secret || Buffer.byteLength(secret, "utf8") < MIN_KEY_LENGTH) {
    throw new Error("TOTP_ENCRYPTION_KEY must be configured with at least 32 bytes");
  }
  return crypto.createHash("sha256").update(secret, "utf8").digest();
}

export function encryptTotpValue(plaintext: string): string {
  if (!plaintext) throw new Error("Cannot encrypt an empty TOTP secret");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("hex"), cipher.getAuthTag().toString("hex"), encrypted.toString("hex")].join(":");
}

export function decryptTotpValue(value: string): string {
  const [version, ivHex, tagHex, ciphertextHex, ...extra] = value.split(":");
  if (version !== VERSION || !ivHex || !tagHex || ciphertextHex === undefined || extra.length > 0) {
    throw new Error("Unsupported or unauthenticated TOTP secret format; re-enroll this account");
  }

  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(tagHex, "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");
  if (iv.length !== 12 || authTag.length !== 16 || ciphertext.length === 0) {
    throw new Error("Invalid encrypted TOTP secret; re-enroll this account");
  }

  const decipher = crypto.createDecipheriv("aes-256-gcm", getEncryptionKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
