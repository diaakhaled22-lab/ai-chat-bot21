import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveNotificationRecipient } from "./email";
import { verifyResendApiKeyLive } from "./companyNotification";

describe("Notification Recipient Safety (J4 fix)", () => {
  const cfg = {
    recipientEmail: "admin-alerts@example.com",
    smtpUser: "smtp-sender@example.com",
  };
  const fetchAdmin = async () => "superadmin@example.com";

  it("refuses fallback to admin email when explicit 'to' is empty or whitespace", async () => {
    assert.equal(await resolveNotificationRecipient({ to: "" }, cfg, fetchAdmin), null);
    assert.equal(await resolveNotificationRecipient({ to: "   " }, cfg, fetchAdmin), null);
    assert.equal(await resolveNotificationRecipient({ to: undefined }, cfg, fetchAdmin), null);
    assert.equal(await resolveNotificationRecipient({ to: "not-an-email" }, cfg, fetchAdmin), null);
  });

  it("returns explicit 'to' when it is a valid non-empty email", async () => {
    assert.equal(
      await resolveNotificationRecipient({ to: "  client@company.com " }, cfg, fetchAdmin),
      "client@company.com"
    );
  });

  it("falls back to configured admin recipient or first admin only when 'to' is omitted", async () => {
    assert.equal(
      await resolveNotificationRecipient({}, cfg, fetchAdmin),
      "admin-alerts@example.com"
    );
    assert.equal(
      await resolveNotificationRecipient({}, { recipientEmail: "", smtpUser: "smtp@example.com" }, fetchAdmin),
      "smtp@example.com"
    );
    assert.equal(
      await resolveNotificationRecipient({}, { recipientEmail: "", smtpUser: "" }, fetchAdmin),
      "superadmin@example.com"
    );
  });
});

describe("Resend API Key Live Verification Fail-Closed (J3 fix)", () => {
  const wellFormedKey = "re_" + "a".repeat(32);

  it("rejects keys with invalid format immediately", async () => {
    const res = await verifyResendApiKeyLive("invalid_key_123", async () => {
      throw new Error("should not call fetch");
    });
    assert.equal(res.valid, false);
    assert.equal(res.statusCode, 400);
  });

  it("rejects keys when Resend is unreachable / times out, even if key starts with re_ and >=24 chars", async () => {
    const res = await verifyResendApiKeyLive(wellFormedKey, (async () => {
      throw new Error("ETIMEDOUT");
    }) as unknown as typeof fetch);
    assert.equal(res.valid, false);
    assert.equal(res.statusCode, 502);
  });

  it("rejects keys when Resend returns unexpected HTTP status on both probes", async () => {
    const res = await verifyResendApiKeyLive(wellFormedKey, (async () =>
      new Response("upstream error", { status: 503 })) as unknown as typeof fetch);
    assert.equal(res.valid, false);
    assert.equal(res.statusCode, 502);
  });

  it("rejects non-JSON 422 responses (e.g., proxy HTML block page)", async () => {
    const res = await verifyResendApiKeyLive(wellFormedKey, (async () =>
      new Response("<html>Blocked</html>", { status: 422 })) as unknown as typeof fetch);
    assert.equal(res.valid, false);
  });

  it("rejects keys explicitly marked unauthorized (401/403)", async () => {
    const res = await verifyResendApiKeyLive(wellFormedKey, (async () =>
      new Response(JSON.stringify({ message: "API key is invalid" }), { status: 401 })) as unknown as typeof fetch);
    assert.equal(res.valid, false);
    assert.equal(res.statusCode, 400);
  });

  it("accepts keys when Resend /emails returns JSON 422 validation_error (authenticated sending key)", async () => {
    const res = await verifyResendApiKeyLive(wellFormedKey, (async () =>
      new Response(
        JSON.stringify({ name: "validation_error", message: "The `from` field is required." }),
        { status: 422, headers: { "Content-Type": "application/json" } }
      )) as unknown as typeof fetch);
    assert.equal(res.valid, true);
  });
});
