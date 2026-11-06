import crypto from "node:crypto";

export function createTelegramWebhookSecret(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function hashTelegramWebhookSecret(secret: string): string {
  return crypto.createHash("sha256").update(secret).digest("hex");
}

export function verifyTelegramWebhookSecret(secret: string, storedHash: string): boolean {
  const hash = Buffer.from(hashTelegramWebhookSecret(secret), "hex");
  const expected = Buffer.from(storedHash, "hex");
  return hash.length === expected.length && crypto.timingSafeEqual(hash, expected);
}
