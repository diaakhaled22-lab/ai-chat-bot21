import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import path from "path";
import { fileURLToPath } from "url";
import compression from "compression";
import router from "./routes";
import { logger } from "./lib/logger";
import { securityHeaders, sanitizeInputs, suspiciousActivityDetector, sessionAnomalyDetector } from "./lib/security";
import { errorSanitizerMiddleware, globalErrorHandler } from "./lib/errorSecurity";
import { sensitiveFilesGuard } from "./lib/sensitiveFilesSecurity";
import { resolveTrustProxySetting } from "./lib/proxySecurity";
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app: Express = express();

// Enforce production mode by default if not explicitly configured
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = "production";
}

// ── Disable Express debug fingerprinting ──────────────────────────────────
// Disables the 'X-Powered-By: Express' header to prevent technology fingerprinting
app.disable("x-powered-by");

// ── Error Sanitizer Middleware ────────────────────────────────────────────
// In production, intercepts outgoing error responses to guarantee NO stack traces,
// internal table names, SQL queries, or file paths leak to clients.
app.use(errorSanitizerMiddleware);

// ── Sensitive Files Public Reachability Defense ───────────────────────────
// Strictly intercepts and blocks any public requests targeting .env files,
// backups (*.bak, *.backup, *.old, ~), SQL dumps (*.sql, *.dump), .git folders,
// and server/project config files (package.json, tsconfig.json, etc.).
app.use(sensitiveFilesGuard);

// ── Trust Proxy Configuration ───────────────────────────────────────────
// Essential for deployments behind reverse proxies (Replit, Cloud Run, Render, Cloudflare, Nginx).
// Without this, req.ip resolves to the internal proxy IP for all users, breaking rate limits,
// IP-based blocking, and Secure cookie flags. In standalone/direct environments without proxies,
// trusting proxies blindly allows client-spoofed X-Forwarded-For and X-Forwarded-Host headers.
// We strictly set trust proxy to 1 ONLY when behind a recognized cloud ingress platform or
// when TRUSTED_PROXIES is explicitly configured. Direct production defaults to false.
const trustProxyResolution = resolveTrustProxySetting();
app.set("trust proxy", trustProxyResolution.value as any);
logger.info(
  {
    trustProxy: trustProxyResolution.value,
    source: trustProxyResolution.source,
    platform: trustProxyResolution.platformName,
    reason: trustProxyResolution.reason,
  },
  "Configured Express trust proxy setting"
);

// ── Automatic HTTP to HTTPS Redirection Middleware ────────────────────────
// Automatically redirects plain HTTP requests to HTTPS with 301 Moved Permanently.
// Preserves host header, original path, and query strings.
// Whitelists internal health checks, local development, and direct IP access.
app.use((req, res, next) => {
  // 1. Allow disabling via environment variable if running in an HTTP-only environment
  if (process.env.DISABLE_HTTPS_REDIRECT === "true" || process.env.DISABLE_HTTPS_REDIRECT === "1") {
    return next();
  }

  // 2. Allow internal health-check probes without redirect
  if (req.path === "/health" || req.path === "/api/health") {
    return next();
  }

  const rawHost = req.headers.host || "";
  const hostname = rawHost.split(":")[0].toLowerCase();

  // 3. Skip localhost and loopback addresses
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]") {
    return next();
  }

  // 4. Skip raw private/internal IPv4 addresses (e.g. Docker / Kubernetes internal VPCs)
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(hostname)) {
    return next();
  }

  const protoHeader = req.headers["x-forwarded-proto"];
  const forwardedProto = typeof protoHeader === "string" ? protoHeader.split(",")[0].trim().toLowerCase() : null;
  const isHttps = req.secure || forwardedProto === "https" || req.protocol === "https";

  if (isHttps) {
    return next();
  }

  // 5. If reverse proxy signaled plain HTTP, or if on a live production domain
  const isDirectIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);
  const shouldRedirect =
    forwardedProto === "http" ||
    (process.env.NODE_ENV === "production" && !isDirectIp) ||
    process.env.FORCE_HTTPS === "true";

  if (shouldRedirect) {
    // Prevent Host header injection during HTTPS redirection (N12 fix)
    // Validate host format (valid domain or domain:port) and fallback to PUBLIC_HOST / canonical host if present
    const validHostPattern = /^[a-zA-Z0-9.\-]+(?::\d+)?$/;
    const trustedHost = process.env.PUBLIC_HOST?.trim() || (validHostPattern.test(rawHost) ? rawHost : undefined);
    if (!trustedHost) {
      return res.status(400).json({ error: "Invalid Host header" });
    }
    const targetUrl = `https://${trustedHost}${req.originalUrl || req.url}`;
    return res.redirect(301, targetUrl);
  }

  next();
});

// ── Security Headers ─────────────────────────────────────────────────────
app.use(securityHeaders);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0].replace(
            /(\/(?:api\/)?(?:telegram\/webhook|webhook\/telegram))\/[^/]+/i,
            "$1/[redacted]",
          ),
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// ── CORS & CSRF Origin Whitelist ─────────────────────────────────────────
// Restrict strictly to configured origins, same-host requests, and THIS specific Repl.
// NEVER wildcard-trust *.replit.app / *.repl.co / *.replit.dev because any Replit user can host code there.
const REPLIT_DEV_DOMAIN = process.env.REPLIT_DEV_DOMAIN?.toLowerCase().trim();
const REPL_SLUG = process.env.REPL_SLUG?.toLowerCase().trim();
const REPL_OWNER = process.env.REPL_OWNER?.toLowerCase().trim();

const specificReplitHosts = new Set<string>();
if (REPLIT_DEV_DOMAIN) {
  specificReplitHosts.add(REPLIT_DEV_DOMAIN);
}
if (REPL_SLUG && REPL_OWNER) {
  specificReplitHosts.add(`${REPL_SLUG}.${REPL_OWNER}.replit.app`);
  specificReplitHosts.add(`${REPL_SLUG}.${REPL_OWNER}.repl.co`);
  specificReplitHosts.add(`${REPL_SLUG}-${REPL_OWNER}.replit.app`);
  specificReplitHosts.add(`${REPL_SLUG}--${REPL_OWNER}.replit.dev`);
}

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

/**
 * Validates whether an origin is allowed for CORS and CSRF protection.
 * Prevents multi-tenant subdomain bypasses on Replit/Cloud providers.
 */
function isAllowedOrigin(origin: string | undefined, reqHost?: string): boolean {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    const originHost = url.host.toLowerCase();
    const originHostname = url.hostname.toLowerCase();

    // 1. Explicitly configured ALLOWED_ORIGINS (env var)
    if (ALLOWED_ORIGINS.length > 0) {
      if (
        ALLOWED_ORIGINS.some((allowed) => {
          try {
            const allowedUrl = new URL(allowed);
            return allowedUrl.host.toLowerCase() === originHost;
          } catch {
            return allowed.toLowerCase() === origin.toLowerCase() || allowed.toLowerCase() === originHost;
          }
        })
      ) {
        return true;
      }
    }

    // 2. Same-host origin: matches the incoming request's Host header
    if (reqHost) {
      const cleanReqHost = reqHost.toLowerCase().trim();
      const reqHostname = cleanReqHost.split(":")[0];
      if (originHost === cleanReqHost || originHostname === reqHostname) {
        return true;
      }
    }

    // 3. Localhost in development mode
    if (originHostname === "localhost" || originHostname === "127.0.0.1") {
      return true;
    }

    // 4. Exact Replit domains belonging to THIS specific Repl only
    if (specificReplitHosts.has(originHostname) || specificReplitHosts.has(originHost)) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

app.use(
  cors((req, callback) => {
    const origin = req.headers.origin;
    const isProxyTrusted = app.get("trust proxy") !== false;
  const reqHost = (isProxyTrusted ? (req.headers["x-forwarded-host"] as string) : undefined) || req.headers.host;

    // Allow requests with no origin (curl, server-to-server, mobile apps)
    if (!origin) {
      return callback(null, { origin: true, credentials: true });
    }

    if (isAllowedOrigin(origin, reqHost)) {
      return callback(null, { origin: true, credentials: true });
    }

    // In development mode with no specific origins configured, allow localhost
    if (process.env.NODE_ENV !== "production") {
      try {
        const url = new URL(origin);
        if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
          return callback(null, { origin: true, credentials: true });
        }
      } catch {}
    }

    logger.warn({ origin, reqHost, path: req.url }, "CORS: blocked cross-origin request from untrusted origin");
    callback(null, { origin: false });
  })
);

declare global {
  namespace Express {
    interface Request {
      rawBody?: Buffer;
    }
  }
}

// ── Granular Request Body Size Limits (DoS & Memory Exhaustion Defense) ──
// Legitimate heavy ingestion routes (knowledge base files, document indexing, storage sync)
// require larger payload limits (up to 15MB).
// Standard API routes (auth, configuration, chat messages) are strictly capped at 1MB
// to prevent memory consumption attacks and CPU exhaustion from large JSON parsing.
// Strictly anchored to actual API endpoints instead of broad substring includes (N13 fix).
const HEAVY_PAYLOAD_ROUTES = new Set([
  "/api/client/company/knowledge-files",
  "/client/company/knowledge-files",
  "/api/client/company/knowledge-files/upload",
  "/client/company/knowledge-files/upload",
  "/api/storage/uploads",
  "/storage/uploads",
  "/api/client/wordpress/sync",
  "/client/wordpress/sync",
  "/api/client/rest-api/sync",
  "/client/rest-api/sync",
  "/api/client/shopify/sync",
  "/client/shopify/sync",
]);

const isHeavyPayloadRoute = (req: express.Request): boolean => {
  const p = (req.path || req.url || "").split("?")[0].toLowerCase().replace(/\/$/, "");
  if (HEAVY_PAYLOAD_ROUTES.has(p)) return true;
  // Also match parameter routes under knowledge-files or storage
  return (
    p.startsWith("/api/client/company/knowledge-files/") ||
    p.startsWith("/client/company/knowledge-files/") ||
    p.startsWith("/api/storage/") ||
    p.startsWith("/storage/")
  );
};

app.use((req, res, next) => {
  const limit = isHeavyPayloadRoute(req) ? "15mb" : "1mb";
  express.json({
    limit,
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  })(req, res, next);
});

app.use(
  express.urlencoded({
    extended: true,
    limit: "1mb",
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

// ── Session — require SESSION_SECRET in production ───────────────────────
import pgSession from "connect-pg-simple";
import { pool } from "@workspace/db"; // Assuming pool is exported from db
import { assertPlanApprovalSecretConfigured } from "./lib/planApproval";

// In production, ensure PLAN_APPROVAL_SECRET is configured before accepting any requests
if (process.env.NODE_ENV === "production") {
  assertPlanApprovalSecretConfigured();
}

// ── Startup Validation — reject missing or placeholder secrets in production ────────
if (process.env.NODE_ENV === 'production') {
  if (!process.env.SESSION_SECRET || !process.env.SESSION_SECRET.trim()) {
    logger.error('FATAL SECURITY ERROR: SESSION_SECRET is required in production. Refusing to start.');
    throw new Error('FATAL SECURITY ERROR: SESSION_SECRET is required in production. Refusing to start.');
  }

  const PLACEHOLDER_PATTERN = /^(replace_with|change_me|your_secret_here|your_key_here)/i;
  const criticalSecrets: Array<[string, string | undefined]> = [
    ['SESSION_SECRET', process.env.SESSION_SECRET],
    ['PLAN_APPROVAL_SECRET', process.env.PLAN_APPROVAL_SECRET],
    ['INBOUND_EMAIL_WEBHOOK_SECRET', process.env.INBOUND_EMAIL_WEBHOOK_SECRET],
    ['ENCRYPTION_KEY', process.env.ENCRYPTION_KEY],
  ];
  for (const [name, value] of criticalSecrets) {
    if (value && PLACEHOLDER_PATTERN.test(value)) {
      logger.error(
        { variable: name },
        `FATAL SECURITY ERROR: ${name} contains a placeholder value. Generate a real secret before deploying to production.`
      );
      throw new Error(`FATAL SECURITY ERROR: ${name} contains a placeholder value in production. Refusing to start.`);
    }
  }
}

const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(64).toString('hex');
if (!process.env.SESSION_SECRET) {
  logger.warn('SECURITY: SESSION_SECRET env var is not set. Using a random secret for non-production environment.');
}

const PgStore = pgSession(session);
const sessionStore = new PgStore({
  pool: pool as any,
  tableName: "session",
  createTableIfMissing: true,
});
sessionStore.on("error", (err) => {
  logger.error({ err }, "Session store error");
});

app.use(
  session({
    name: "sid",
    store: sessionStore,
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      secure: "auto",
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: "lax",
    },
  }),
);

// ── Security Layers ──────────────────────────────────────────────────────
app.use(sanitizeInputs);            // Strip null bytes & dangerous control chars
app.use(suspiciousActivityDetector); // Block SQL injection, XSS, path traversal attempts
app.use(sessionAnomalyDetector);     // Smart session anomaly detection

// ── CSRF Protection — Origin/Referer check for state-changing requests ───
app.use((req, res, next) => {
  // Only check state-changing methods
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    return next();
  }

  const urlPath = req.path || req.url?.split("?")[0] || "";

  // 1. Identify session-sensitive routes that must NEVER be exempted from CSRF
  // (e.g. /telegram/register-webhook, client and admin actions)
  const isSessionSensitive =
    urlPath.includes("register-webhook") ||
    urlPath.includes("webhook-info") ||
    urlPath.startsWith("/api/client") ||
    urlPath.startsWith("/client") ||
    urlPath.startsWith("/api/admin") ||
    urlPath.startsWith("/admin");

  // 2. Skip CSRF ONLY for true external webhook ingestion and public widget endpoints
  const isPublicWebhookOrWidget =
    !isSessionSensitive &&
    (urlPath === "/api/telegram/webhook" ||
      urlPath === "/telegram/webhook" ||
      urlPath === "/webhook/telegram" ||
      urlPath.startsWith("/api/whatsapp/webhook") ||
      urlPath.startsWith("/whatsapp/webhook") ||
      urlPath.startsWith("/webhook/whatsapp") ||
      urlPath.startsWith("/api/messenger/webhook") ||
      urlPath.startsWith("/messenger/webhook") ||
      urlPath.startsWith("/webhook/messenger") ||
      urlPath === "/api/webhook/message" ||
      urlPath === "/webhook/message" ||
      urlPath === "/api/webhook" ||
      urlPath === "/webhook" ||
      urlPath.startsWith("/api/webhook/") ||
      urlPath.startsWith("/webhook/") ||
      urlPath.startsWith("/api/widget/") ||
      urlPath.startsWith("/widget/"));

  if (isPublicWebhookOrWidget) {
    return next();
  }

  // 3. If request has no session (not authenticated), skip CSRF
  if (!req.session?.userId) {
    return next();
  }

  // 4. Authenticated state-changing request: verify Origin or Referer strictly
  const originHeader = req.headers.origin || req.headers.referer;
  if (!originHeader) {
    // Browsers always send Origin or Referer on cross-site and fetch/form submissions.
    return next();
  }

  const isProxyTrusted = app.get("trust proxy") !== false;
  const reqHost = (isProxyTrusted ? (req.headers["x-forwarded-host"] as string) : undefined) || req.headers.host;
  if (isAllowedOrigin(originHeader, reqHost)) {
    return next();
  }

  logger.warn(
    { origin: originHeader, path: urlPath, method: req.method, userId: req.session.userId },
    "CSRF: blocked request from unauthorized origin"
  );
  res.status(403).json({ error: "Forbidden: cross-origin request blocked" });
});

// ── Webhook Path Normalization ───────────────────────────────────────────
// External platforms (Meta, Telegram, Zapier, custom integrations) often
// send webhooks to root paths (e.g. /whatsapp/webhook or /webhook/message).
// Normalize them to the /api router prefix so they match registered routes.
app.use((req, _res, next) => {
  const urlPath = req.url.split("?")[0];
  if (
    urlPath.startsWith("/webhook") ||
    urlPath.startsWith("/webhooks") ||
    urlPath.startsWith("/email/inbound") ||
    urlPath.startsWith("/plan-requests/approve") ||
    urlPath === "/webhook" ||
    urlPath.startsWith("/whatsapp/webhook") ||
    urlPath.startsWith("/messenger/webhook") ||
    urlPath.startsWith("/telegram/webhook") ||
    urlPath.startsWith("/webhook/whatsapp") ||
    urlPath.startsWith("/webhook/messenger") ||
    urlPath.startsWith("/webhook/telegram")
  ) {
    if (!req.url.startsWith("/api/")) {
      req.url = `/api${req.url}`;
    }
  }
  next();
});

// ── HTTP Response Compression (Gzip / Deflate) ───────────────────────────
// Dramatically reduces transferred bytes for JS bundles, CSS, HTML, and JSON.
// Significant performance improvement for FCP and LCP.
app.use(
  compression({
    filter: (req, res) => {
      if (req.headers["x-no-compression"]) {
        return false;
      }
      return compression.filter(req, res);
    },
    threshold: 1024,
  })
);

app.use(
  "/api",
  express.static(path.join(__dirname, "../public"), {
    dotfiles: "deny",
    index: false,
  })
);
app.use("/api", router);

// Serve the frontend static files in production
if (process.env.NODE_ENV === "production" || process.env.SERVE_STATIC === "true") {
  const frontendDist = path.join(__dirname, "../../chatbot-admin/dist/public");

  // Explicit handler for /.well-known static directory (e.g. acme-challenge, security.txt)
  // Ensures standard ACME/security files can be served even with dotfiles: "deny" default
  const wellKnownDir = path.join(frontendDist, ".well-known");
  app.use(
    "/.well-known",
    express.static(wellKnownDir, {
      dotfiles: "allow",
      index: false,
    })
  );

  // 1. Long-term immutable caching for hashed assets in /assets/ (JS chunks, CSS)
  const assetsDir = path.join(frontendDist, "assets");
  app.use(
    "/assets",
    express.static(assetsDir, {
      dotfiles: "deny",
      index: false,
      maxAge: "1y",
      immutable: true,
    })
  );

  // 2. Long-term caching for static fonts in /fonts/ and /fontawesome/
  const fontsDir = path.join(frontendDist, "fonts");
  app.use(
    "/fonts",
    express.static(fontsDir, {
      dotfiles: "deny",
      index: false,
      maxAge: "1y",
      immutable: true,
    })
  );

  const fontawesomeDir = path.join(frontendDist, "fontawesome");
  app.use(
    "/fontawesome",
    express.static(fontawesomeDir, {
      dotfiles: "deny",
      index: false,
      maxAge: "1y",
      immutable: true,
    })
  );

  // 3. Fallback static serving for other root files (favicon, robots.txt, etc.)
  app.use(
    express.static(frontendDist, {
      dotfiles: "deny",
      index: false,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith("index.html")) {
          // Never cache index.html so clients always get fresh asset hashes
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        }
      },
    })
  );

  // In Express 5 (path-to-regexp v8), wildcards must be named (e.g. `/{*splat}`).
  // Bare '*' throws: PathError: Missing parameter name at index 1: *
  app.get("/{*splat}", (req, res) => {
    // If the request points to a missing file asset with an extension (e.g. .sql, .env, .js, .json)
    // that was not found by static handlers, return 404 instead of falling back to SPA index.html
    const pathname = (req.path || "").toLowerCase();
    const ext = path.extname(pathname);
    if (ext && ext !== ".html") {
      res.status(404).json({ error: "Not Found" });
      return;
    }
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

// ── Global Error Handling Middleware ──────────────────────────────────────
// Catches unhandled errors, logs full technical details and stack traces internally,
// and returns a clean, generic error to the client without exposing internals.
app.use(globalErrorHandler);

export default app;
