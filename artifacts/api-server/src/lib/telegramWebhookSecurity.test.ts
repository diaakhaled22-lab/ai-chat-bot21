import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createTelegramWebhookSecret,
  hashTelegramWebhookSecret,
  verifyTelegramWebhookSecret,
} from "./telegramWebhookSecurity";

describe("Telegram webhook secrets", () => {
  it("generates an independent 256-bit secret", () => {
    const first = createTelegramWebhookSecret();
    const second = createTelegramWebhookSecret();

    assert.match(first, /^[a-f0-9]{64}$/);
    assert.notEqual(first, second);
  });

  it("stores only a hash and verifies the Telegram header secret", () => {
    const secret = createTelegramWebhookSecret();
    const storedHash = hashTelegramWebhookSecret(secret);

    assert.notEqual(storedHash, secret);
    assert.equal(verifyTelegramWebhookSecret(secret, storedHash), true);
    assert.equal(verifyTelegramWebhookSecret("wrong-secret", storedHash), false);
  });
});
