process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://test_user:test_password@localhost:5432/test_db";
process.env.PLAN_APPROVAL_SECRET = process.env.PLAN_APPROVAL_SECRET || "test-plan-approval-secret-32-chars-long";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import express from "express";
import http from "http";
import { securityHeaders, revokeAllUserSessions } from "./security";
import { isSensitivePath, sensitiveFilesGuard } from "./sensitiveFilesSecurity";
import { sanitizeUserFacingErrorMessage, containsSensitiveErrorInfo } from "./errorSecurity";

describe("1. Granular Request Body Size Limits Hardening", () => {
  const isHeavyPayloadRoute = (req: express.Request): boolean => {
    const p = (req.path || req.url || "").split("?")[0].toLowerCase().replace(/\/$/, "");
    return (
      p.startsWith("/api/client/company/knowledge-files") ||
      p.startsWith("/api/knowledge-files") ||
      p.startsWith("/api/storage")
    );
  };

  const createTestApp = () => {
    const app = express();
    app.use((req, res, next) => {
      const limit = isHeavyPayloadRoute(req) ? "15mb" : "1mb";
      express.json({ limit })(req, res, next);
    });
    app.post("/api/auth/login", (req, res) => {
      res.json({ success: true, size: JSON.stringify(req.body).length });
    });
    app.post("/api/knowledge-files/upload", (req, res) => {
      res.json({ success: true, size: JSON.stringify(req.body).length });
    });
    app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      if (err.type === "entity.too.large" || err.status === 413) {
        res.status(413).json({ error: "Payload Too Large" });
        return;
      }
      res.status(500).json({ error: err.message });
    });
    return app;
  };

  it("permits standard JSON payloads (< 1MB) on standard routes", async () => {
    const app = createTestApp();
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;

    const smallPayload = JSON.stringify({ username: "admin", data: "x".repeat(50_000) });
    const res = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: smallPayload,
    });

    assert.equal(res.status, 200);
    const data = (await res.json()) as any;
    assert.equal(data.success, true);
    server.close();
  });

  it("blocks oversized payloads (> 1MB) on standard routes with HTTP 413", async () => {
    const app = createTestApp();
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;

    // 1.2 MB payload
    const largePayload = JSON.stringify({ username: "attacker", bomb: "A".repeat(1_200_000) });
    const res = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: largePayload,
    });

    assert.equal(res.status, 413, "Expected 413 Payload Too Large on auth route with > 1MB payload");
    const data = (await res.json()) as any;
    assert.equal(data.error, "Payload Too Large");
    server.close();
  });

  it("allows large payloads (up to 15MB) on designated ingestion routes", async () => {
    const app = createTestApp();
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;

    // 2.5 MB payload
    const heavyPayload = JSON.stringify({ fileName: "manual.pdf", content: "B".repeat(2_500_000) });
    const res = await fetch(`http://127.0.0.1:${port}/api/knowledge-files/upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: heavyPayload,
    });

    assert.equal(res.status, 200, "Ingestion route should accept heavy payloads up to 15MB");
    const data = (await res.json()) as any;
    assert.equal(data.success, true);
    server.close();
  });
});

describe("2. Security Headers & Cookie Hardening", () => {
  it("enforces strict security headers: CSP, HSTS, X-Frame-Options, X-Permitted-Cross-Domain-Policies", () => {
    const headers: Record<string, string> = {};
    const req = { secure: true, headers: { "x-forwarded-proto": "https" } } as any;
    const res = {
      setHeader(k: string, v: string) {
        headers[k.toLowerCase()] = v;
      },
    } as any;
    let nextCalled = false;

    securityHeaders(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(headers["x-content-type-options"], "nosniff");
    assert.equal(headers["x-frame-options"], "DENY");
    assert.equal(headers["x-xss-protection"], "1; mode=block");
    assert.equal(headers["referrer-policy"], "strict-origin-when-cross-origin");
    assert.equal(headers["x-permitted-cross-domain-policies"], "none");
    assert.ok(headers["permissions-policy"].includes("microphone=(self)"));
    assert.ok(headers["permissions-policy"].includes("camera=()"));
    assert.ok(headers["permissions-policy"].includes("geolocation=()"));
    assert.ok(headers["content-security-policy"].includes("default-src 'self'"));
    assert.ok(headers["content-security-policy"].includes("frame-ancestors 'none'"));
    assert.ok(headers["strict-transport-security"].includes("max-age=31536000"));
  });
});

describe("3. Session Revocation on Credential Changes", () => {
  it("validates input parameters safely without crashing on edge cases", async () => {
    assert.equal(await revokeAllUserSessions(0), 0);
    assert.equal(await revokeAllUserSessions(NaN), 0);
    assert.equal(await revokeAllUserSessions(-1 as any), 0);
  });
});

describe("4. Sensitive Files Public Reachability Defense", () => {
  it("blocks attempts to reach environment files and backups", () => {
    const blockedPaths = [
      "/.env",
      "/.env.production",
      "/.git/config",
      "/.git/HEAD",
      "/database.sql",
      "/backup.bak",
      "/schema.dump",
      "/package.json",
      "/tsconfig.json",
    ];

    for (const p of blockedPaths) {
      assert.equal(isSensitivePath(p), true, `Should have blocked: ${p}`);
    }
  });

  it("permits safe public assets and api routes", () => {
    const safePaths = [
      "/index.html",
      "/assets/app.js",
      "/api/widget/123/config",
      "/api/auth/admin/login",
      "/favicon.svg",
    ];

    for (const p of safePaths) {
      assert.equal(isSensitivePath(p), false, `Should not block safe path: ${p}`);
    }
  });
});

describe("5. Production Error Sanitization & Anti-Fingerprinting", () => {
  it("detects sensitive internal error information", () => {
    assert.equal(containsSensitiveErrorInfo("Error at query (C:\\server\\db.ts:12)"), true);
    assert.equal(containsSensitiveErrorInfo('relation "usersTable" does not exist'), true);
    assert.equal(containsSensitiveErrorInfo("failed with code ENOENT: /var/app/index.mjs"), true);
  });

  it("sanitizes 500 errors to a clean generic message in production", () => {
    const leaked = "Error: SELECT * FROM users failed at node:internal/process:40";
    const sanitized = sanitizeUserFacingErrorMessage(leaked, 500, true);
    assert.equal(sanitized, "An unexpected error occurred. Please try again later.");
    assert.equal(containsSensitiveErrorInfo(sanitized), false);
  });
});
