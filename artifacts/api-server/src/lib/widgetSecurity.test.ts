import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isWidgetOriginAllowed } from "./widgetSecurity";

describe("widget origin restrictions", () => {
  it("rejects requests without an Origin when domains are configured", () => {
    assert.equal(isWidgetOriginAllowed(undefined, "example.com"), false);
  });

  it("allows the configured host and its subdomains", () => {
    assert.equal(isWidgetOriginAllowed("https://example.com", "example.com"), true);
    assert.equal(isWidgetOriginAllowed("https://shop.example.com", "example.com"), true);
  });

  it("rejects other hosts and malformed origins", () => {
    assert.equal(isWidgetOriginAllowed("https://notexample.com", "example.com"), false);
    assert.equal(isWidgetOriginAllowed("not-a-url", "example.com"), false);
  });

  it("keeps unrestricted widgets compatible when no domains are configured", () => {
    assert.equal(isWidgetOriginAllowed(undefined, null), true);
    assert.equal(isWidgetOriginAllowed("https://anywhere.example", ""), true);
  });
});
