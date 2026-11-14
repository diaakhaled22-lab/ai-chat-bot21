import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isSafeUrl, safeFetch } from "./urlSecurity";
import { isAccountLocked, recordFailedLogin, resetLoginAttempts, isCaptchaRequired, calculateProgressiveDelay } from "./security";

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

    // Account should NOT be locked out for a fresh IP (DoS protection)
    assert.equal(isAccountLocked(distributedUser, "198.51.100.99"), 0);

    // Resetting unlocks
    resetLoginAttempts(distributedUser);
    assert.equal(isCaptchaRequired(distributedUser), false);
  });
});
