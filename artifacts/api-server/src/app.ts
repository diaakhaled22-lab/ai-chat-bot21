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
app.set("trust proxy", 1);

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
          url: req.url?.split("?")[0],
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

// ── CORS — restrict to known origins ─────────────────────────────────────
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, server-to-server, mobile apps)
    if (!origin) return callback(null, true);
    // If specific origins are configured, enforce them regardless of env
    if (ALLOWED_ORIGINS.length > 0) {
      if (ALLOWED_ORIGINS.includes(origin)) {
        return callback(null, true);
      }
      callback(new Error("Not allowed by CORS"));
      return;
    }
    // No origins configured — allow same-host origins and Replit/localhost dev origins
    try {
      const url = new URL(origin);
      const hostname = url.hostname.toLowerCase();
      if (hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".repl.co") || hostname.endsWith(".replit.dev") || hostname.endsWith(".replit.app")) {
        return callback(null, true);
      }
    } catch {}
    // In development mode with no origins configured, allow all (backward compatible)
    if (process.env.NODE_ENV !== "production") {
      return callback(null, true);
    }
    callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
}));

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
  // Skip CSRF check for webhook endpoints (external services send POST without origin)
  const urlPath = req.path || req.url?.split("?")[0] || "";
  if (
    urlPath.startsWith("/api/webhook") || urlPath.startsWith("/webhook") ||
    urlPath.startsWith("/api/whatsapp") || urlPath.startsWith("/whatsapp") ||
    urlPath.startsWith("/api/telegram") || urlPath.startsWith("/telegram") ||
    urlPath.startsWith("/api/messenger") || urlPath.startsWith("/messenger") ||
    urlPath.startsWith("/api/widget")   || urlPath.startsWith("/widget")
  ) {
    return next();
  }
  // If request has no session (not authenticated), skip CSRF
  if (!req.session?.userId) {
    return next();
  }
  const origin = req.headers.origin || req.headers.referer;
  if (!origin) {
    // Allow requests with no origin (curl, mobile apps, server-to-server)
    return next();
  }
  try {
    const url = new URL(origin);
    const hostname = url.hostname.toLowerCase();
    // Allow same-host, localhost, and Replit
    if (
      hostname === "localhost" || hostname === "127.0.0.1" ||
      hostname.endsWith(".repl.co") || hostname.endsWith(".replit.dev") || hostname.endsWith(".replit.app") ||
      (ALLOWED_ORIGINS.length > 0 && ALLOWED_ORIGINS.some(o => { try { return new URL(o).hostname === hostname; } catch { return false; } }))
    ) {
      return next();
    }
  } catch {}
  logger.warn({ origin, path: urlPath, method: req.method, userId: req.session.userId }, "CSRF: blocked request from unexpected origin");
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
