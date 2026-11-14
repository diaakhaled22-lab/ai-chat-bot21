import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import path from "path";
import { fileURLToPath } from "url";
import router from "./routes";
import { logger } from "./lib/logger";
import { securityHeaders, sanitizeInputs, suspiciousActivityDetector, sessionAnomalyDetector } from "./lib/security";
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app: Express = express();

// ── Trust Proxy Configuration ───────────────────────────────────────────
// Essential for deployments behind reverse proxies (Replit, Cloud Run, Render, Cloudflare, Nginx).
// Without this, req.ip resolves to the internal proxy IP for all users, breaking rate limits,
// IP-based blocking, and Secure cookie flags. In standalone/direct environments without proxies,
// trusting proxies blindly allows client-spoofed X-Forwarded-For and X-Forwarded-Host headers.
const isBehindKnownReverseProxy = Boolean(
  process.env.REPLIT_DEV_DOMAIN ||
  process.env.REPLIT_CLUSTER ||
  process.env.K_SERVICE || // Google Cloud Run
  process.env.RENDER || // Render
  process.env.RAILWAY_ENVIRONMENT || // Railway
  process.env.VERCEL || // Vercel
  process.env.HEROKU_APP_ID || // Heroku
  process.env.FLY_ALLOC_ID // Fly.io
);

const rawTrustedProxies = process.env.TRUSTED_PROXIES?.trim();
if (rawTrustedProxies) {
  if (rawTrustedProxies === "false" || rawTrustedProxies === "0") {
    app.set("trust proxy", false);
  } else if (rawTrustedProxies === "true" || rawTrustedProxies === "1") {
    app.set("trust proxy", 1);
  } else {
    const proxiesList = rawTrustedProxies.split(",").map((p) => p.trim()).filter(Boolean);
    app.set("trust proxy", proxiesList.length === 1 ? proxiesList[0] : (proxiesList.length > 0 ? proxiesList : 1));
  }
} else if (isBehindKnownReverseProxy) {
  // Known cloud PaaS/container ingress automatically terminates TLS and routes through 1 hop
  app.set("trust proxy", 1);
} else {
  // Standalone/direct VPS deployments default to untrusted to prevent header spoofing
  app.set("trust proxy", false);
}

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

app.use(
  express.json({
    limit: "10mb",
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(
  express.urlencoded({
    extended: true,
    limit: "10mb",
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

// ── Startup Validation — reject placeholder secrets in production ────────
if (process.env.NODE_ENV === 'production') {
  const PLACEHOLDER_PATTERN = /^replace_with/i;
  const criticalSecrets: Array<[string, string | undefined]> = [
    ['SESSION_SECRET', process.env.SESSION_SECRET],
    ['PLAN_APPROVAL_SECRET', process.env.PLAN_APPROVAL_SECRET],
    ['INBOUND_EMAIL_WEBHOOK_SECRET', process.env.INBOUND_EMAIL_WEBHOOK_SECRET],
  ];
  for (const [name, value] of criticalSecrets) {
    if (value && PLACEHOLDER_PATTERN.test(value)) {
      logger.error(
        { variable: name },
        `FATAL: ${name} contains a placeholder value. Generate a real secret before deploying to production.`
      );
      if (process.env.REQUIRE_STRICT_SECRETS === 'true') {
        throw new Error(`${name} contains a placeholder value. Refusing to start.`);
      }
    }
  }
}

const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(64).toString('hex');
if (!process.env.SESSION_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    logger.warn('SECURITY: SESSION_SECRET env var is not set. Using a random secret — sessions will not survive restarts.');
  }
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
    store: sessionStore,
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
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

app.use("/api", express.static(path.join(__dirname, "../public")));
app.use("/api", router);

// Serve the frontend static files in production
if (process.env.NODE_ENV === "production" || process.env.SERVE_STATIC === "true") {
  const frontendDist = path.join(__dirname, "../../chatbot-admin/dist/public");
  app.use(express.static(frontendDist));
  app.get("*", (req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

export default app;
