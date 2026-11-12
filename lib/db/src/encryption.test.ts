import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { encrypt, decrypt, getEncryptionKey, getDecryptionKeys } from "./encryption";

describe("Database Field Encryption & Multi-Key Decryption", () => {
  it("encrypts and decrypts text successfully with primary key", () => {
    const original = "my-secret-telegram-token-12345";
    const encrypted = encrypt(original);
    assert.ok(encrypted);
    assert.ok(encrypted.startsWith("enc:"));
    assert.notEqual(encrypted, original);

    const decrypted = decrypt(encrypted);
    assert.equal(decrypted, original);
  });

  it("preserves plaintext strings without modification (backward compatibility)", () => {
    const plaintext = "sk-plain-text-key-before-encryption";
    assert.equal(decrypt(plaintext), plaintext);
    assert.equal(decrypt(null), null);
    assert.equal(decrypt(undefined), undefined);
    assert.equal(decrypt(""), "");
  });

  it("safely handles malformed enc strings by returning null", () => {
    assert.equal(decrypt("enc:invalid"), null);
    assert.equal(decrypt("enc:1:2"), null);
    assert.equal(decrypt("enc:1:2:3:4"), null);
  });

  it("successfully decrypts data encrypted with a previous key (key rotation / fallback candidate)", () => {
    // Encrypt with a previous database URL key
    const prevDbUrl = "postgres://user:pass@ep-cool-db.neon.tech/main?sslmode=require";
    const prevKey = crypto.createHash("sha256").update(prevDbUrl).digest();

    const secretText = "super-confidential-api-token";
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", prevKey, iv);
    let ciphertext = cipher.update(secretText, "utf8", "hex");
    ciphertext += cipher.final("hex");
    const authTag = cipher.getAuthTag().toString("hex");
    const encString = `enc:${iv.toString("hex")}:${authTag}:${ciphertext}`;

    // Temporarily set DATABASE_URL in process.env to simulate candidate key availability
    const oldEnvDb = process.env.DATABASE_URL;
    try {
      process.env.DATABASE_URL = prevDbUrl;
      const decrypted = decrypt(encString);
      assert.equal(decrypted, secretText);
    } finally {
      process.env.DATABASE_URL = oldEnvDb;
    }
  });

  it("successfully decrypts data via PREVIOUS_ENCRYPTION_KEYS environment variable", () => {
    const rotatedKey = "a".repeat(64); // 32 bytes hex
    const rotatedKeyBuf = Buffer.from(rotatedKey, "hex");

    const secret = "whatsapp-token-abc";
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", rotatedKeyBuf, iv);
    let ciphertext = cipher.update(secret, "utf8", "hex");
    ciphertext += cipher.final("hex");
    const authTag = cipher.getAuthTag().toString("hex");
    const encString = `enc:${iv.toString("hex")}:${authTag}:${ciphertext}`;

    const oldPrev = process.env.PREVIOUS_ENCRYPTION_KEYS;
    try {
      process.env.PREVIOUS_ENCRYPTION_KEYS = `some-other-key,${rotatedKey}`;
      const decrypted = decrypt(encString);
      assert.equal(decrypted, secret);
    } finally {
      process.env.PREVIOUS_ENCRYPTION_KEYS = oldPrev;
    }
  });
});
