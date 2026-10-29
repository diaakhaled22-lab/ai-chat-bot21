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

const isProduction = process.env.NODE_ENV === "production";
if (isProduction && ALLOWED_ORIGINS.length === 0) {
  logger.warn("SECURITY: ALLOWED_ORIGINS is not set. Cross-origin requests will be served without credentials; set ALLOWED_ORIGINS to your frontend origin(s).");
}

// Credentialed (cookie) CORS is only ever granted to explicitly allowed
// origins. Reflecting any origin together with `credentials: true` would let
// any website make authenticated requests as a logged-in admin/client.
app.use(cors((req, callback) => {
  const origin = req.headers.origin;
  // No Origin header (curl, server-to-server, same-origin) — nothing to reflect
  if (!origin) return callback(null, { origin: false });
  // Development: keep the permissive behaviour
  if (!isProduction) return callback(null, { origin: true, credentials: true });
  if (ALLOWED_ORIGINS.includes(origin)) {
    return callback(null, { origin: true, credentials: true });
  }
  if (ALLOWED_ORIGINS.length === 0) {
    // Public endpoints (chat widget, webhooks) may be called from customer
    // sites, but never with cookies.
    return callback(null, { origin: true, credentials: false });
  }
  callback(new Error("Not allowed by CORS"));
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

// ── Webhook Path Normalization ───────────────────────────────────────────
// External platforms (Meta, Telegram, Zapier, custom integrations) often
// send webhooks to root paths (e.g. /whatsapp/webhook or /webhook/message).
// Normalize them to the /api router prefix so they match registered routes.
app.use((req, _res, next) => {
  const urlPath = req.url.split("?")[0];
  if (
    urlPath.startsWith("/webhook/") ||
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
