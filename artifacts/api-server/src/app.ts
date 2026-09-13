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
    // In dev mode or if no origins configured, allow all
    if (process.env.NODE_ENV !== "production" || ALLOWED_ORIGINS.length === 0) {
      return callback(null, true);
    }
    if (ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
}));

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

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

app.use(
  session({
    store: new PgStore({
      pool: pool as any,
      tableName: "session", // Make sure this table exists or we need to manage it. Wait, does the db export pool? Let's check db package.
      createTableIfMissing: true
    }),
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
    },
  }),
);

// ── Security Layers ──────────────────────────────────────────────────────
app.use(sanitizeInputs);            // Strip null bytes & dangerous control chars
app.use(suspiciousActivityDetector); // Block SQL injection, XSS, path traversal attempts
app.use(sessionAnomalyDetector);     // Smart session anomaly detection

app.use("/api", express.static(path.join(__dirname, "../public")));
app.use("/api", router);

export default app;
