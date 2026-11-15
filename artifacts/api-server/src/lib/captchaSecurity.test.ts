import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  extractCaptchaToken,
  verifyCaptchaToken,
  clearCaptchaSecretCache,
} from "./captchaSecurity";
import {
  recordFailedLogin,
  resetLoginAttempts,
  isCaptchaRequired,
} from "./security";

describe("CAPTCHA Token Extraction & Validation", () => {
  beforeEach(() => {
    clearCaptchaSecretCache();
  });

  describe("extractCaptchaToken", () => {
    it("extracts turnstileToken from body", () => {
      const req = { body: { turnstileToken: "cf-token-12345" } };
      assert.equal(extractCaptchaToken(req), "cf-token-12345");
    });

    it("extracts captchaToken from body", () => {
      const req = { body: { captchaToken: "token-67890" } };
      assert.equal(extractCaptchaToken(req), "token-67890");
    });

    it("extracts cf-turnstile-response header", () => {
      const req = { body: {}, headers: { "cf-turnstile-response": "header-token-abc" } };
      assert.equal(extractCaptchaToken(req), "header-token-abc");
    });

    it("returns undefined when no token is present", () => {
      const req = { body: { username: "admin", password: "pwd" }, headers: {} };
      assert.equal(extractCaptchaToken(req), undefined);
    });
  });

  describe("verifyCaptchaToken", () => {
    it("rejects missing, empty, or whitespace-only tokens", async () => {
      assert.equal((await verifyCaptchaToken(undefined)).valid, false);
      assert.equal((await verifyCaptchaToken(null)).valid, false);
      assert.equal((await verifyCaptchaToken("")).valid, false);
      assert.equal((await verifyCaptchaToken("   ")).valid, false);
    });

    it("accepts official Cloudflare Turnstile test pass tokens", async () => {
      const res1 = await verifyCaptchaToken("1x0000000000000000000000000000000AA");
      assert.equal(res1.valid, true);

      const res2 = await verifyCaptchaToken("test-turnstile-pass");
      assert.equal(res2.valid, true);

      const res3 = await verifyCaptchaToken("test-captcha-valid");
      assert.equal(res3.valid, true);
    });

    it("rejects official Cloudflare Turnstile test fail tokens", async () => {
      const res1 = await verifyCaptchaToken("2x0000000000000000000000000000000AA");
      assert.equal(res1.valid, false);

      const res2 = await verifyCaptchaToken("test-turnstile-fail");
      assert.equal(res2.valid, false);

      const res3 = await verifyCaptchaToken("test-invalid-captcha");
      assert.equal(res3.valid, false);
    });

    it("strictly rejects test bypass tokens in production (C1 fix)", async () => {
      const origEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = "production";
        const res = await verifyCaptchaToken("test-captcha-valid");
        // In production without configured upstream secret, it fails securely
        assert.equal(res.valid, false);
        assert.equal(res.reason, "captcha_unconfigured_in_production");
      } finally {
        process.env.NODE_ENV = origEnv;
      }
    });
  });
});

describe("CAPTCHA Enforcement on Repeated Failed Logins (Security Rule)", () => {
  const targetUser = "brute_force_target_user";
  const testIp = "192.0.2.100";

  beforeEach(() => {
    resetLoginAttempts(targetUser, testIp);
  });

  it("triggers isCaptchaRequired after 5 failed attempts and blocks requests without valid token", async () => {
    // 1. Initial state: captcha is not required
    assert.equal(isCaptchaRequired(targetUser), false);

    // 2. Perform 5 failed attempts across different or same IPs
    for (let i = 1; i <= 5; i++) {
      recordFailedLogin(targetUser, `192.0.2.${i}`);
    }

    // 3. CAPTCHA is now strictly required for this account
    assert.equal(isCaptchaRequired(targetUser), true);

    // 4. Verification logic enforces presence of token
    const emptyReq = { body: { username: targetUser, password: "wrong" } };
    const missingToken = extractCaptchaToken(emptyReq);
    assert.equal(missingToken, undefined);

    // 5. Verification logic rejects invalid tokens
    const invalidReq = { body: { username: targetUser, password: "wrong", turnstileToken: "test-turnstile-fail" } };
    const invalidToken = extractCaptchaToken(invalidReq);
    const invalidResult = await verifyCaptchaToken(invalidToken, testIp);
    assert.equal(invalidResult.valid, false);

    // 6. Verification logic accepts valid tokens
    const validReq = { body: { username: targetUser, password: "correct", turnstileToken: "test-turnstile-pass" } };
    const validToken = extractCaptchaToken(validReq);
    const validResult = await verifyCaptchaToken(validToken, testIp);
    assert.equal(validResult.valid, true);

    // 7. Successful login resets attempts and clears CAPTCHA requirement
    resetLoginAttempts(targetUser, testIp);
    assert.equal(isCaptchaRequired(targetUser), false);
  });
});
