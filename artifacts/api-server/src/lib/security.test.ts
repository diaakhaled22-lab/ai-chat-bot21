import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isSafeUrl, safeFetch } from "./urlSecurity";
import {
  isAccountLocked,
  recordFailedLogin,
  resetLoginAttempts,
  isCaptchaRequired,
  calculateProgressiveDelay,
  getAccountRetryAfter,
  getAccountNextAllowedAt,
  securityHeaders,
  revokeAllUserSessions,
} from "./security";

describe("SSRF URL validation", () => {
  it("rejects private, mapped, link-local, and unspecified IP addresses", () => {
    const urls = [
      "http://127.0.0.1",
      "http://[::ffff:127.0.0.1]",
      "http://[fd00::1]",
      "http://[fe80::1]",
      "http://[::]",
      "http://169.254.169.254",
    ];

    for (const url of urls) {
      assert.equal(isSafeUrl(url), false, `${url} should be rejected`);
    }
  });

  it("normalizes trailing dots and rejects loopback-resolving hostnames", () => {
    assert.equal(isSafeUrl("http://metadata.google.internal."), false);
    assert.equal(isSafeUrl("http://localtest.me"), false);
  });

  it("allows public HTTP(S) hosts", () => {
    assert.equal(isSafeUrl("https://example.com"), true);
  });

  it("rejects a request to a private IPv6 address before connecting", async () => {
    await assert.rejects(() => safeFetch("http://[::ffff:127.0.0.1]"));
  });
});

describe("Account lockout IP scoping (DoS prevention - N1)", () => {
  it("locks out only the attacking IP after 5 failed logins, leaving legitimate users on other IPs unlocked", () => {
    const targetUser = "victim_admin";
    const attackerIp = "203.0.113.50";
    const legitimateIp = "198.51.100.99";

    // Attacker submits 5 failed attempts
    for (let i = 0; i < 5; i++) {
      recordFailedLogin(targetUser, attackerIp);
    }

    // Attacker IP must be locked out
    const attackerLock = isAccountLocked(targetUser, attackerIp);
    assert.ok(attackerLock > 0, "Attacker IP should be locked out");

    // Legitimate IP must NOT be locked out
    const legitLock = isAccountLocked(targetUser, legitimateIp);
    assert.equal(legitLock, 0, "Legitimate IP must not be locked out");

    // Resetting for attacker unlocks them
    resetLoginAttempts(targetUser, attackerIp);
    assert.equal(isAccountLocked(targetUser, attackerIp), 0);
  });

  it("applies progressive delay and triggers captchaRequired on distributed brute force attacks (R2)", () => {
    const distributedUser = "distributed_target";

    // Simulate attempts from 7 different IPs (1 attempt each)
    let lastResult: any;
    for (let i = 1; i <= 7; i++) {
      lastResult = recordFailedLogin(distributedUser, `198.51.100.${i}`);
    }

    // After 7 distributed attempts (threshold is 5), progressive delay must be > 0 and captcha must be required
    assert.ok(lastResult.progressiveDelayMs > 0, "Progressive delay should be applied after threshold");
    assert.equal(lastResult.captchaRequired, true, "Captcha should be required after threshold");
    assert.equal(isCaptchaRequired(distributedUser), true, "isCaptchaRequired helper should return true");

    // Non-blocking nextAllowedAt and Retry-After tracking
    assert.ok(typeof lastResult.nextAllowedAt === "number" && lastResult.nextAllowedAt > Date.now(), "nextAllowedAt must be in the future");
    assert.ok(typeof lastResult.retryAfterSeconds === "number" && lastResult.retryAfterSeconds > 0, "retryAfterSeconds must be > 0");
    assert.ok(getAccountRetryAfter(distributedUser) > 0, "getAccountRetryAfter must return positive seconds");
    assert.ok(getAccountNextAllowedAt(distributedUser)! > Date.now(), "getAccountNextAllowedAt must return future timestamp");

    // Account should NOT be locked out for a fresh IP (DoS protection)
    assert.equal(isAccountLocked(distributedUser, "198.51.100.99"), 0);

    // Resetting unlocks and clears nextAllowedAt
    resetLoginAttempts(distributedUser);
    assert.equal(isCaptchaRequired(distributedUser), false);
    assert.equal(getAccountRetryAfter(distributedUser), 0);
    assert.equal(getAccountNextAllowedAt(distributedUser), null);
  });
});

describe("securityHeaders middleware hardening", () => {
  it("enforces X-Permitted-Cross-Domain-Policies, nosniff, DENY, and strict CSP", () => {
    const headers: Record<string, string> = {};
    const req = { secure: false, headers: {} } as any;
    const res = {
      setHeader(k: string, v: string) {
        headers[k] = v;
      },
    } as any;
    let nextCalled = false;

    securityHeaders(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(headers["X-Permitted-Cross-Domain-Policies"], "none");
    assert.equal(headers["X-Content-Type-Options"], "nosniff");
    assert.equal(headers["X-Frame-Options"], "DENY");
    assert.ok(headers["Content-Security-Policy"].includes("default-src 'self'"));
    assert.ok(headers["Permissions-Policy"].includes("microphone=(self)"));
  });
});

describe("revokeAllUserSessions parameter validation", () => {
  it("safely handles invalid user IDs without throwing", async () => {
    const res1 = await revokeAllUserSessions(0);
    assert.equal(res1, 0);

    const res2 = await revokeAllUserSessions(NaN);
    assert.equal(res2, 0);
  });
});
