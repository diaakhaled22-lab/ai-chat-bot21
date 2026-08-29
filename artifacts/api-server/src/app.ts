import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import path from "path";
import { fileURLToPath } from "url";
import router from "./routes";
import { logger } from "./lib/logger";
import { securityHeaders, sanitizeInputs, suspiciousActivityDetector, sessionIpBinding } from "./lib/security";

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
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret && process.env.NODE_ENV === "production") {
  throw new Error("SESSION_SECRET environment variable is required in production.");
}

app.use(
  session({
    secret: sessionSecret || "dev-only-secret-" + Math.random().toString(36),
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
app.use(sessionIpBinding);           // Bind session to IP — detect hijacking

app.use("/api", express.static(path.join(__dirname, "../public")));
app.use("/api", router);

export default app;
