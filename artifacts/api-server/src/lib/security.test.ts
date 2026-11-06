import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isSafeUrl, safeFetch } from "./urlSecurity";

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
