import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { decryptTotpValue, encryptTotpValue } from "./totpEncryption";

const previousKey = process.env.TOTP_ENCRYPTION_KEY;
process.env.TOTP_ENCRYPTION_KEY = "test-key-with-at-least-thirty-two-bytes";
after(() => {
  if (previousKey === undefined) delete process.env.TOTP_ENCRYPTION_KEY;
  else process.env.TOTP_ENCRYPTION_KEY = previousKey;
});

describe("TOTP secret encryption", () => {
  it("round-trips secrets using authenticated encryption", () => {
    const encrypted = encryptTotpValue("JBSWY3DPEHPK3PXP");
    assert.match(encrypted, /^v2:/);
    assert.equal(decryptTotpValue(encrypted), "JBSWY3DPEHPK3PXP");
  });

  it("rejects modified ciphertext and unauthenticated legacy values", () => {
    const encrypted = encryptTotpValue("JBSWY3DPEHPK3PXP");
    const parts = encrypted.split(":");
    const lastChar = parts[3].slice(-1);
    parts[3] = `${parts[3].slice(0, -1)}${lastChar === "0" ? "1" : "0"}`;
    assert.throws(() => decryptTotpValue(parts.join(":")));
    assert.throws(() => decryptTotpValue("JBSWY3DPEHPK3PXP"), /re-enroll/);
    assert.throws(() => decryptTotpValue("ivhex:cipherhex"), /re-enroll/);
  });

  it("requires a configured key of sufficient length", () => {
    const encrypted = encryptTotpValue("JBSWY3DPEHPK3PXP");
    delete process.env.TOTP_ENCRYPTION_KEY;
    assert.throws(() => encryptTotpValue("secret"), /TOTP_ENCRYPTION_KEY/);
    assert.throws(() => decryptTotpValue(encrypted), /TOTP_ENCRYPTION_KEY/);
  });
});
