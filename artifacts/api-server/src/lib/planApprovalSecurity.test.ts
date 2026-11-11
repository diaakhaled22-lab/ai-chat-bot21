import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import crypto from "node:crypto";
import {
  createApprovalToken,
  verifyApprovalToken,
  getPlanApprovalSecret,
  assertPlanApprovalSecretConfigured,
  markApprovalTokenUsed,
  isApprovalTokenUsed,
} from "./planApproval";

describe("Plan approval token security and hardening", () => {
  const TEST_SECRET = "test-plan-approval-secret-key-32-chars-long";

  beforeEach(() => {
    process.env.PLAN_APPROVAL_SECRET = TEST_SECRET;
  });

  it("throws error and refuses operation when REQUIRE_STRICT_SECRETS is enabled and PLAN_APPROVAL_SECRET is missing", () => {
    delete process.env.PLAN_APPROVAL_SECRET;
    process.env.REQUIRE_STRICT_SECRETS = "true";

    assert.throws(
      () => getPlanApprovalSecret(),
      /PLAN_APPROVAL_SECRET environment variable is missing/
    );

    assert.throws(
      () => assertPlanApprovalSecretConfigured(),
      /PLAN_APPROVAL_SECRET environment variable is missing/
    );

    assert.throws(
      () => createApprovalToken(101),
      /PLAN_APPROVAL_SECRET environment variable is missing/
    );

    // Restore
    delete process.env.REQUIRE_STRICT_SECRETS;
    process.env.PLAN_APPROVAL_SECRET = TEST_SECRET;
  });

  it("generates a safe random ephemeral secret without crashing when PLAN_APPROVAL_SECRET is not configured in standard mode", () => {
    delete process.env.PLAN_APPROVAL_SECRET;
    delete process.env.REQUIRE_STRICT_SECRETS;

    const secret = getPlanApprovalSecret();
    assert.ok(typeof secret === "string" && secret.length === 64, "Must generate a 32-byte (64 hex) secure secret");

    const token = createApprovalToken(999);
    assert.equal(verifyApprovalToken(999, token), true);

    // Restore
    process.env.PLAN_APPROVAL_SECRET = TEST_SECRET;
  });

  it("creates a cryptographically signed token with an expiration timestamp", () => {
    const ticketId = 42;
    const token = createApprovalToken(ticketId);

    assert.ok(typeof token === "string");
    const parts = token.split(".");
    assert.equal(parts.length, 2, "Token must be formatted as expiresAt.signature");

    const expiresAt = Number(parts[0]);
    assert.ok(!isNaN(expiresAt));
    assert.ok(expiresAt > Date.now(), "Token expiration must be in the future");
    assert.equal(parts[1].length, 64, "SHA-256 HMAC signature must be 64 hex characters");
  });

  it("verifies a valid, freshly generated approval token", () => {
    const ticketId = 77;
    const token = createApprovalToken(ticketId);

    const isValid = verifyApprovalToken(ticketId, token);
    assert.equal(isValid, true);
  });

  it("rejects token when verified against a different ticketId", () => {
    const ticketId = 77;
    const token = createApprovalToken(ticketId);

    const isValid = verifyApprovalToken(99, token);
    assert.equal(isValid, false, "Token must be tied strictly to the matching ticketId");
  });

  it("rejects tampered or forged signatures", () => {
    const ticketId = 12;
    const token = createApprovalToken(ticketId);
    const [expiresAt, sig] = token.split(".");

    // Alter the signature by flipping the first character
    const tamperedSig = (sig[0] === "a" ? "b" : "a") + sig.slice(1);
    const tamperedToken = `${expiresAt}.${tamperedSig}`;

    assert.equal(verifyApprovalToken(ticketId, tamperedToken), false);
  });

  it("rejects tokens forged using the old hardcoded fallback salt", () => {
    const ticketId = 15;
    const oldSalt = "bot-manager-plan-approval-secret-salt-2026";
    const forgedToken = crypto
      .createHmac("sha256", oldSalt)
      .update(`approve-plan-ticket-${ticketId}`)
      .digest("hex");

    assert.equal(verifyApprovalToken(ticketId, forgedToken), false);
  });

  it("rejects expired tokens", () => {
    const ticketId = 88;
    // Generate a token that expired 1 second ago (-1000ms)
    const expiredToken = createApprovalToken(ticketId, -1000);

    assert.equal(verifyApprovalToken(ticketId, expiredToken), false);
  });

  it("enforces single-use: rejects token once it has been marked as consumed", () => {
    const ticketId = 55;
    const token = createApprovalToken(ticketId);

    // Initially valid
    assert.equal(verifyApprovalToken(ticketId, token), true);
    assert.equal(isApprovalTokenUsed(ticketId, token), false);

    // Consume the token
    markApprovalTokenUsed(ticketId, token);

    // Must now be rejected as used
    assert.equal(isApprovalTokenUsed(ticketId, token), true);
    assert.equal(verifyApprovalToken(ticketId, token), false);
  });
});
