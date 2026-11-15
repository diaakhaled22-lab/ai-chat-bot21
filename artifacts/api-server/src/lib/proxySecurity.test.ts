import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  detectKnownProxyPlatform,
  resolveTrustProxySetting,
} from "./proxySecurity";

describe("detectKnownProxyPlatform", () => {
  it("detects Replit via REPLIT_DEV_DOMAIN", () => {
    assert.equal(detectKnownProxyPlatform({ REPLIT_DEV_DOMAIN: "example.replit.dev" }), "Replit");
  });

  it("detects Google Cloud Run via K_SERVICE", () => {
    assert.equal(detectKnownProxyPlatform({ K_SERVICE: "my-service" }), "Google Cloud Run");
  });

  it("detects Render via RENDER", () => {
    assert.equal(detectKnownProxyPlatform({ RENDER: "true" }), "Render");
  });

  it("detects Railway via RAILWAY_ENVIRONMENT", () => {
    assert.equal(detectKnownProxyPlatform({ RAILWAY_ENVIRONMENT: "production" }), "Railway");
  });

  it("detects Vercel via VERCEL", () => {
    assert.equal(detectKnownProxyPlatform({ VERCEL: "1" }), "Vercel");
  });

  it("detects Heroku via DYNO", () => {
    assert.equal(detectKnownProxyPlatform({ DYNO: "web.1" }), "Heroku");
  });

  it("detects Fly.io via FLY_ALLOC_ID", () => {
    assert.equal(detectKnownProxyPlatform({ FLY_ALLOC_ID: "abc123" }), "Fly.io");
  });

  it("detects Cloudflare Pages via CF_PAGES", () => {
    assert.equal(detectKnownProxyPlatform({ CF_PAGES: "1" }), "Cloudflare Pages");
  });

  it("detects DigitalOcean App Platform via DIGITALOCEAN_APP_ID", () => {
    assert.equal(detectKnownProxyPlatform({ DIGITALOCEAN_APP_ID: "do-app-123" }), "DigitalOcean App Platform");
  });

  it("detects Netlify via NETLIFY", () => {
    assert.equal(detectKnownProxyPlatform({ NETLIFY: "true" }), "Netlify");
  });

  it("requires explicit TRUSTED_PROXIES in AWS environments without blindly trusting AWS_EXECUTION_ENV (C6 fix)", () => {
    assert.equal(detectKnownProxyPlatform({ AWS_EXECUTION_ENV: "AWS_Lambda_nodejs20.x" }), null);
  });

  it("returns null when no known cloud proxy platform is present", () => {
    assert.equal(detectKnownProxyPlatform({ NODE_ENV: "production" }), null);
    assert.equal(detectKnownProxyPlatform({}), null);
  });
});

describe("resolveTrustProxySetting", () => {
  it("strictly defaults to false in standalone production without known proxy", () => {
    const res = resolveTrustProxySetting({ NODE_ENV: "production" });
    assert.equal(res.value, false);
    assert.equal(res.source, "direct_default");
  });

  it("strictly defaults to false in development/test without known proxy", () => {
    const res = resolveTrustProxySetting({ NODE_ENV: "development" });
    assert.equal(res.value, false);
    assert.equal(res.source, "direct_default");
  });

  it("sets 1 hop when known platform (e.g. Render) is detected", () => {
    const res = resolveTrustProxySetting({ RENDER: "true", NODE_ENV: "production" });
    assert.equal(res.value, 1);
    assert.equal(res.source, "known_platform");
    assert.equal(res.platformName, "Render");
  });

  it("sets 1 hop when Google Cloud Run is detected", () => {
    const res = resolveTrustProxySetting({ K_SERVICE: "chat-api" });
    assert.equal(res.value, 1);
    assert.equal(res.source, "known_platform");
    assert.equal(res.platformName, "Google Cloud Run");
  });

  it("respects TRUSTED_PROXIES='false'", () => {
    const res = resolveTrustProxySetting({ TRUSTED_PROXIES: "false", RENDER: "true" });
    assert.equal(res.value, false);
    assert.equal(res.source, "explicit_env");
  });

  it("respects TRUSTED_PROXIES='0'", () => {
    const res = resolveTrustProxySetting({ TRUSTED_PROXIES: "0" });
    assert.equal(res.value, false);
    assert.equal(res.source, "explicit_env");
  });

  it("respects TRUSTED_PROXIES='true' or '1'", () => {
    const resTrue = resolveTrustProxySetting({ TRUSTED_PROXIES: "true" });
    assert.equal(resTrue.value, 1);
    assert.equal(resTrue.source, "explicit_env");

    const resOne = resolveTrustProxySetting({ TRUSTED_PROXIES: "1" });
    assert.equal(resOne.value, 1);
    assert.equal(resOne.source, "explicit_env");
  });

  it("respects numeric hop count e.g. TRUSTED_PROXIES='2'", () => {
    const res = resolveTrustProxySetting({ TRUSTED_PROXIES: "2" });
    assert.equal(res.value, 2);
    assert.equal(res.source, "explicit_env");
  });

  it("respects single IP or subnet string e.g. TRUSTED_PROXIES='127.0.0.1'", () => {
    const res = resolveTrustProxySetting({ TRUSTED_PROXIES: "127.0.0.1" });
    assert.equal(res.value, "127.0.0.1");
    assert.equal(res.source, "explicit_env");
  });

  it("respects comma-separated IP/subnet list e.g. TRUSTED_PROXIES='127.0.0.1, 10.0.0.0/8'", () => {
    const res = resolveTrustProxySetting({ TRUSTED_PROXIES: "127.0.0.1, 10.0.0.0/8" });
    assert.deepEqual(res.value, ["127.0.0.1", "10.0.0.0/8"]);
    assert.equal(res.source, "explicit_env");
  });
});
