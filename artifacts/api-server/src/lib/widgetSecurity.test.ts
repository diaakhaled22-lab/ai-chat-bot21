import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isWidgetOriginAllowed,
  parseAllowedDomains,
  isAutomatedOrNonBrowserAgent,
  isValidWidgetSessionId,
  checkSessionRateLimit,
  checkWidgetRateLimit,
  checkDailyWidgetLimit,
  validateWidgetRequest,
} from "./widgetSecurity";

describe("widget origin restrictions and security hardening", () => {
  it("rejects requests without an Origin", () => {
    assert.equal(isWidgetOriginAllowed(undefined, "example.com"), false);
    assert.equal(isWidgetOriginAllowed(undefined, null), false);
    assert.equal(isWidgetOriginAllowed(undefined, ""), false);
  });

  it("CRITICAL: rejects arbitrary external origins when no domains are configured (prevents token quota draining)", () => {
    assert.equal(isWidgetOriginAllowed("https://malicious-site.com", null), false);
    assert.equal(isWidgetOriginAllowed("https://attacker.org", ""), false);
    assert.equal(isWidgetOriginAllowed("https://random-domain.io", undefined), false);
  });

  it("falls back to websiteDataUrl when widgetAllowedDomains is empty", () => {
    assert.equal(isWidgetOriginAllowed("https://company.com", null, "https://company.com"), true);
    assert.equal(isWidgetOriginAllowed("https://blog.company.com", "", "https://company.com"), true);
    assert.equal(isWidgetOriginAllowed("https://attacker.com", null, "https://company.com"), false);
  });

  it("allows localhost and 127.0.0.1 for development / local testing", () => {
    assert.equal(isWidgetOriginAllowed("http://localhost:5173", null), true);
    assert.equal(isWidgetOriginAllowed("http://127.0.0.1:3000", ""), true);
  });

  it("allows SaaS serverHost for dashboard preview even when no external domains are set", () => {
    assert.equal(
      isWidgetOriginAllowed("https://saas-chatbot.replit.app", null, null, "saas-chatbot.replit.app"),
      true
    );
    assert.equal(
      isWidgetOriginAllowed("https://app.mysite.com", null, null, "app.mysite.com:443"),
      true
    );
    assert.equal(
      isWidgetOriginAllowed("https://attacker.com", null, null, "app.mysite.com"),
      false
    );
  });

  it("allows configured host and its subdomains", () => {
    assert.equal(isWidgetOriginAllowed("https://example.com", "example.com"), true);
    assert.equal(isWidgetOriginAllowed("https://shop.example.com", "example.com"), true);
    assert.equal(isWidgetOriginAllowed("https://api.sub.example.com", "example.com"), true);
  });

  it("rejects mismatching hosts, prefix spoofs, and malformed origins", () => {
    assert.equal(isWidgetOriginAllowed("https://notexample.com", "example.com"), false);
    assert.equal(isWidgetOriginAllowed("https://example.com.attacker.com", "example.com"), false);
    assert.equal(isWidgetOriginAllowed("not-a-url", "example.com"), false);
    assert.equal(isWidgetOriginAllowed("javascript:alert(1)", "example.com"), false);
  });

  it("parseAllowedDomains cleans protocols, ports, and wildcards", () => {
    const parsed = parseAllowedDomains("https://example.com:8080, *.second.org, third.io/");
    assert.deepEqual(parsed, ["example.com", "second.org", "third.io"]);
  });
});

describe("automated tool & non-browser client detection", () => {
  it("detects automated CLI and scraping tools", () => {
    assert.equal(isAutomatedOrNonBrowserAgent("curl/7.88.1"), true);
    assert.equal(isAutomatedOrNonBrowserAgent("python-requests/2.31.0"), true);
    assert.equal(isAutomatedOrNonBrowserAgent("node-fetch/1.0"), true);
    assert.equal(isAutomatedOrNonBrowserAgent("PostmanRuntime/7.32.3"), true);
    assert.equal(isAutomatedOrNonBrowserAgent("Go-http-client/1.1"), true);
    assert.equal(isAutomatedOrNonBrowserAgent(""), true);
    assert.equal(isAutomatedOrNonBrowserAgent(undefined), true);
  });

  it("allows standard web browser User-Agents", () => {
    const chrome = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    const safari = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1";
    assert.equal(isAutomatedOrNonBrowserAgent(chrome), false);
    assert.equal(isAutomatedOrNonBrowserAgent(safari), false);
  });
});

describe("widget session ID validation", () => {
  it("accepts valid official widget session IDs and preview IDs", () => {
    // Official widget format (ws_ followed by 64 hex chars)
    const validHex64 = "ws_" + "a".repeat(64);
    assert.equal(isValidWidgetSessionId(validHex64), true);

    // Dashboard preview format
    assert.equal(isValidWidgetSessionId("preview_abcdef123"), true);

    // Standard UUID format
    assert.equal(isValidWidgetSessionId("123e4567-e89b-12d3-a456-426614174000"), true);
  });

  it("rejects invalid or missing session IDs", () => {
    assert.equal(isValidWidgetSessionId(""), false);
    assert.equal(isValidWidgetSessionId(null), false);
    assert.equal(isValidWidgetSessionId(undefined), false);
    assert.equal(isValidWidgetSessionId("123"), false);
    assert.equal(isValidWidgetSessionId("ws_short"), false);
    assert.equal(isValidWidgetSessionId("../path/traversal"), false);
  });
});

describe("session and IP sliding-window rate limiter", () => {
  it("enforces a maximum of 15 messages per minute per session", () => {
    const testSessionId = "ws_" + "f".repeat(64);
    for (let i = 0; i < 15; i++) {
      const res = checkSessionRateLimit(testSessionId);
      assert.equal(res.allowed, true);
    }

    // 16th message in the same minute must be throttled
    const blocked = checkSessionRateLimit(testSessionId);
    assert.equal(blocked.allowed, false);
    assert.ok(blocked.retryAfterSeconds && blocked.retryAfterSeconds > 0);
  });

  it("enforces IP-based rate limiting (max 30 msgs/min) when an attacker rotates session IDs", () => {
    const attackerIp = "198.51.100.42";
    for (let i = 0; i < 30; i++) {
      const uniqueSession = `ws_${i.toString().padStart(64, "0")}`;
      const res = checkWidgetRateLimit(uniqueSession, attackerIp);
      assert.equal(res.allowed, true);
    }

    // 31st request with yet another session ID from the same IP must be rejected
    const blocked = checkWidgetRateLimit("ws_rotating_session_31", attackerIp);
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.reason, "ip");
    assert.ok(blocked.retryAfterSeconds && blocked.retryAfterSeconds > 0);
  });
});

describe("validateWidgetRequest helper", () => {
  const browserUa = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

  it("blocks requests when widget is disabled for company", () => {
    const res = validateWidgetRequest(
      { headers: { origin: "https://example.com", "user-agent": browserUa } },
      { widgetEnabled: false, widgetAllowedDomains: "example.com" }
    );
    assert.equal(res.valid, false);
    assert.equal(res.status, 403);
  });

  it("blocks requests without Origin or Referer", () => {
    const res = validateWidgetRequest(
      { headers: { "user-agent": browserUa } },
      { widgetEnabled: true, widgetAllowedDomains: "example.com" }
    );
    assert.equal(res.valid, false);
    assert.equal(res.status, 403);
  });

  it("blocks requests with non-browser User-Agent", () => {
    const res = validateWidgetRequest(
      { headers: { origin: "https://example.com", "user-agent": "curl/8.1.2" } },
      { widgetEnabled: true, widgetAllowedDomains: "example.com" }
    );
    assert.equal(res.valid, false);
    assert.equal(res.status, 403);
  });

  it("blocks requests from unauthorized origins", () => {
    const res = validateWidgetRequest(
      { headers: { origin: "https://attacker.com", "user-agent": browserUa } },
      { widgetEnabled: true, widgetAllowedDomains: "example.com" }
    );
    assert.equal(res.valid, false);
    assert.equal(res.status, 403);
  });

  it("allows valid requests from authorized origins", () => {
    const res = validateWidgetRequest(
      { headers: { origin: "https://example.com", "user-agent": browserUa } },
      { widgetEnabled: true, widgetAllowedDomains: "example.com" }
    );
    assert.equal(res.valid, true);
    assert.equal(res.status, 200);
    assert.equal(res.allowedOrigin, "https://example.com");
  });
});

describe("checkDailyWidgetLimit (R6)", () => {
  it("allows messages within daily limits and tracks remaining", () => {
    const res = checkDailyWidgetLimit("test-daily-widget-key", "203.0.113.1");
    assert.equal(res.allowed, true);
    assert.ok(res.remaining > 0);
  });

  it("enforces per-IP daily limit to prevent a single IP from exhausting the assistant quota", () => {
    const widgetKey = "test-ip-cap-widget-key";
    const abusiveIp = "203.0.113.88";

    // Exhaust the 300 daily messages cap for this single IP
    for (let i = 0; i < 300; i++) {
      checkDailyWidgetLimit(widgetKey, abusiveIp);
    }

    const blocked = checkDailyWidgetLimit(widgetKey, abusiveIp);
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.reason, "ip");

    // Another clean IP must still be allowed on the same widget!
    const cleanIp = "203.0.113.89";
    const allowed = checkDailyWidgetLimit(widgetKey, cleanIp);
    assert.equal(allowed.allowed, true);
  });
});
