import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import {
  encrypt,
  decrypt,
  getEncryptionKey,
  getDecryptionKeys,
  isSensitiveAdminConfigKey,
  encryptAdminConfigValue,
  decryptAdminConfigValue,
} from "./encryption";

describe("Database Field Encryption & Multi-Key Decryption", () => {
  it("encrypts and decrypts text successfully with primary key", () => {
    const oldNodeEnv = process.env.NODE_ENV;
    const oldEncKey = process.env.ENCRYPTION_KEY;
    try {
      process.env.NODE_ENV = "production";
      process.env.ENCRYPTION_KEY = "b".repeat(64);
      const original = "my-secret-telegram-token-12345";
      const encrypted = encrypt(original);
      assert.ok(encrypted);
      assert.ok(encrypted.startsWith("enc:"));
      assert.notEqual(encrypted, original);

      const decrypted = decrypt(encrypted);
      assert.equal(decrypted, original);
    } finally {
      process.env.NODE_ENV = oldNodeEnv;
      if (oldEncKey === undefined) delete process.env.ENCRYPTION_KEY;
      else process.env.ENCRYPTION_KEY = oldEncKey;
    }
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

  it("rejects missing, whitespace, or placeholder ENCRYPTION_KEY in production (J1)", () => {
    const oldNodeEnv = process.env.NODE_ENV;
    const oldEncKey = process.env.ENCRYPTION_KEY;
    const oldSession = process.env.SESSION_SECRET;
    const oldDb = process.env.DATABASE_URL;
    try {
      process.env.NODE_ENV = "production";
      process.env.SESSION_SECRET = "super-secret-session-value-at-least-32-chars";
      process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/db";

      delete process.env.ENCRYPTION_KEY;
      assert.throws(() => getEncryptionKey(), /ENCRYPTION_KEY environment variable is required/);

      process.env.ENCRYPTION_KEY = "   ";
      assert.throws(() => getEncryptionKey(), /ENCRYPTION_KEY environment variable is required/);

      for (const placeholder of ["replace_with_a_key", "change_me", "your_key_here", "your_secret_here"]) {
        process.env.ENCRYPTION_KEY = placeholder;
        assert.throws(() => getEncryptionKey(), /placeholder value/);
      }
    } finally {
      process.env.NODE_ENV = oldNodeEnv;
      if (oldEncKey === undefined) delete process.env.ENCRYPTION_KEY;
      else process.env.ENCRYPTION_KEY = oldEncKey;
      if (oldSession === undefined) delete process.env.SESSION_SECRET;
      else process.env.SESSION_SECRET = oldSession;
      if (oldDb === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = oldDb;
    }
  });

  it("fails closed in encrypt() instead of returning plaintext when key is invalid (J2)", () => {
    const oldNodeEnv = process.env.NODE_ENV;
    const oldEncKey = process.env.ENCRYPTION_KEY;
    try {
      process.env.NODE_ENV = "production";
      delete process.env.ENCRYPTION_KEY;
      assert.throws(() => encrypt("super-secret-smtp-pass"), /ENCRYPTION_KEY/);
    } finally {
      process.env.NODE_ENV = oldNodeEnv;
      if (oldEncKey === undefined) delete process.env.ENCRYPTION_KEY;
      else process.env.ENCRYPTION_KEY = oldEncKey;
    }
  });

  it("does NOT allow DATABASE_URL/SESSION_SECRET fallback keys in production unless ALLOW_LEGACY_FALLBACK_KEYS=true (J1/D4)", () => {
    const oldNodeEnv = process.env.NODE_ENV;
    const oldEncKey = process.env.ENCRYPTION_KEY;
    const oldAllowLegacy = process.env.ALLOW_LEGACY_FALLBACK_KEYS;
    const oldSession = process.env.SESSION_SECRET;
    const oldDb = process.env.DATABASE_URL;
    try {
      process.env.NODE_ENV = "production";
      delete process.env.ENCRYPTION_KEY;
      delete process.env.ALLOW_LEGACY_FALLBACK_KEYS;
      process.env.SESSION_SECRET = "legacy-session-secret";
      process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/db";

      assert.equal(getDecryptionKeys().length, 0);

      process.env.ALLOW_LEGACY_FALLBACK_KEYS = "true";
      assert.ok(getDecryptionKeys().length >= 2);
    } finally {
      process.env.NODE_ENV = oldNodeEnv;
      if (oldEncKey === undefined) delete process.env.ENCRYPTION_KEY;
      else process.env.ENCRYPTION_KEY = oldEncKey;
      if (oldAllowLegacy === undefined) delete process.env.ALLOW_LEGACY_FALLBACK_KEYS;
      else process.env.ALLOW_LEGACY_FALLBACK_KEYS = oldAllowLegacy;
      if (oldSession === undefined) delete process.env.SESSION_SECRET;
      else process.env.SESSION_SECRET = oldSession;
      if (oldDb === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = oldDb;
    }
  });

  it("successfully decrypts data encrypted with a previous key in dev/test mode", () => {
    const prevDbUrl = "postgres://user:pass@ep-cool-db.neon.tech/main?sslmode=require";
    const prevKey = crypto.createHash("sha256").update(prevDbUrl).digest();

    const secretText = "super-confidential-api-token";
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", prevKey, iv);
    let ciphertext = cipher.update(secretText, "utf8", "hex");
    ciphertext += cipher.final("hex");
    const authTag = cipher.getAuthTag().toString("hex");
    const encString = `enc:${iv.toString("hex")}:${authTag}:${ciphertext}`;

    const oldEnvDb = process.env.DATABASE_URL;
    const oldNodeEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "test";
      process.env.DATABASE_URL = prevDbUrl;
      const decrypted = decrypt(encString);
      assert.equal(decrypted, secretText);
    } finally {
      process.env.DATABASE_URL = oldEnvDb;
      process.env.NODE_ENV = oldNodeEnv;
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
      if (oldPrev === undefined) delete process.env.PREVIOUS_ENCRYPTION_KEYS;
      else process.env.PREVIOUS_ENCRYPTION_KEYS = oldPrev;
    }
  });

  it("encrypts sensitive admin_config keys and leaves non-sensitive keys untouched (H6)", () => {
    const oldNodeEnv = process.env.NODE_ENV;
    const oldEncKey = process.env.ENCRYPTION_KEY;
    try {
      process.env.NODE_ENV = "production";
      process.env.ENCRYPTION_KEY = "c".repeat(64);

      assert.equal(isSensitiveAdminConfigKey("resend_api_key"), true);
      assert.equal(isSensitiveAdminConfigKey("notif_smtp_pass"), true);
      assert.equal(isSensitiveAdminConfigKey("ai_test_key_openai"), true);
      assert.equal(isSensitiveAdminConfigKey("notif_smtp_host"), false);

      const encResend = encryptAdminConfigValue("resend_api_key", "re_test_secret_123456");
      assert.ok(encResend && encResend.startsWith("enc:"));
      assert.equal(decryptAdminConfigValue("resend_api_key", encResend), "re_test_secret_123456");

      // Legacy unencrypted plaintext still decrypts seamlessly before migration
      assert.equal(decryptAdminConfigValue("notif_smtp_pass", "legacy-app-pass"), "legacy-app-pass");

      // Non-sensitive setting remains plaintext
      assert.equal(encryptAdminConfigValue("notif_smtp_host", "smtp.gmail.com"), "smtp.gmail.com");
      assert.equal(decryptAdminConfigValue("notif_smtp_host", "smtp.gmail.com"), "smtp.gmail.com");
    } finally {
      process.env.NODE_ENV = oldNodeEnv;
      if (oldEncKey === undefined) delete process.env.ENCRYPTION_KEY;
      else process.env.ENCRYPTION_KEY = oldEncKey;
    }
  });
});
