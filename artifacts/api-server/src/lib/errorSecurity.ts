import { Request, Response, NextFunction } from "express";
import { logger } from "./logger";

/**
 * Patterns matching sensitive internal server details that must never leak to clients:
 * 1. Stack traces (e.g., "at Object.execute (file:///...)", ".ts:123:45", "Error: ...")
 * 2. File system paths (e.g., "C:\Users\...", "/workspace/...", "/node_modules/...")
 * 3. Database queries, table names, and ORM internals (e.g., "companiesTable", 'relation "users" does not exist')
 * 4. Internal network addresses and connection strings (e.g., "127.0.0.1", "postgresql://...")
 */
const SENSITIVE_INTERNAL_PATTERNS = [
  // Stack traces
  /\bat\s+(?:[a-zA-Z0-9_$.<>]+\s+\()?([A-Za-z]:[\\\/]|\/|\.\/|[a-zA-Z0-9_-]+)/i,
  /\b(at\s+async|\bat\s+new|\bat\s+Module|\bat\s+processTicksAndRejections|\bat\s+emitUnhandledRejectionOrHandled)\b/i,
  /\.(?:ts|js|mjs|cjs):\d+:\d+/i,
  /^\s*error:\s+at\s+/im,

  // Windows file paths
  /[A-Za-z]:[\\\/][a-zA-Z0-9_.\-\\\/]+/i,

  // Linux / Unix file paths
  /(?:\/workspace|\/home|\/app|\/root|\/etc|\/usr|\/node_modules|\/artifacts|\/dist)[a-zA-Z0-9_.\-\/]*/i,

  // Node filesystem error codes
  /\b(?:ENOENT|EACCES|EPERM|EISDIR|ENOTDIR|EMFILE|EEXIST)\b/,

  // Database / SQL queries and errors
  /\b(?:select\s+.*\s+from|insert\s+into|update\s+.*\s+set|delete\s+from|drop\s+table|alter\s+table|create\s+table)\b/i,
  /\b(?:relation|column|table|constraint|index)\s+["'][^"']+["']/i,
  /\b(?:violates\s+(?:unique|foreign\s+key|not-null|check)\s+constraint|duplicate\s+key\s+value)\b/i,
  /\b(?:syntax\s+error\s+at\s+or\s+near|null\s+value\s+in\s+column|column\s+.*does\s+not\s+exist)\b/i,

  // Table names in our schema
  /\b(?:users|companies|tickets|chat_logs|company_knowledge_files|leads|messages|notifications|session|admin_config|admin_activity_logs)(?:Table|_table)?\b/i,
  /\b(?:drizzle-orm|drizzle|postgres|postgresql|pg_catalog|pool_error)\b/i,

  // Internal connection strings and IPs
  /\bpostgres(?:ql)?:\/\/[^\s]+/i,
  /\b(?:127\.0\.0\.1|localhost:\d+|169\.254\.169\.254)\b/i,
  /\b(?:ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH)\b/i,
];

/**
 * Checks whether an error message contains sensitive internal server details.
 */
export function containsSensitiveErrorInfo(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  return SENSITIVE_INTERNAL_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Sanitizes user-facing error messages in production.
 * - For 5xx errors: Always returns a generic safe message.
 * - For 4xx errors: Replaces any error containing sensitive internals with a clean generic message.
 */
export function sanitizeUserFacingErrorMessage(
  message: unknown,
  statusCode = 500,
  forceProduction?: boolean
): string {
  const isProduction =
    forceProduction !== undefined
      ? forceProduction
      : process.env.NODE_ENV === "production" || process.env.SANITIZE_ERRORS === "true";

  const msgStr = typeof message === "string" ? message.trim() : "";

  // In non-production (development), allow raw messages unless they contain fatal stack dumps
  if (!isProduction) {
    return msgStr || (statusCode >= 500 ? "Internal server error" : "Bad request");
  }

  // 1. All 5xx server errors must be completely generic in production
  if (statusCode >= 500) {
    return "An unexpected error occurred. Please try again later.";
  }

  // 2. 4xx errors: If they contain any internal paths, table names, or stack traces, sanitize them
  if (containsSensitiveErrorInfo(msgStr)) {
    return "Invalid request. Please verify your input and try again.";
  }

  // Return safe client validation message if clean, otherwise generic fallback
  return msgStr || "Invalid request.";
}

/**
 * Response Sanitizer Middleware:
 * Wraps res.json and res.send to ensure NO internal stack traces, database table names,
 * SQL statements, or file paths leak to clients in production, regardless of which controller sent it.
 */
export function errorSanitizerMiddleware(_req: Request, res: Response, next: NextFunction) {
  const isProduction = process.env.NODE_ENV === "production" || process.env.SANITIZE_ERRORS === "true";

  if (isProduction) {
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);

    res.json = function (body: any) {
      if (body && typeof body === "object") {
        // Strip stack traces or internal trace properties
        if ("stack" in body) delete body.stack;
        if ("trace" in body) delete body.trace;

        if (typeof body.error === "string") {
          body.error = sanitizeUserFacingErrorMessage(body.error, res.statusCode, true);
        }
        if (typeof body.details === "string") {
          body.details = sanitizeUserFacingErrorMessage(body.details, res.statusCode, true);
        }
        if (typeof body.message === "string" && res.statusCode >= 400) {
          body.message = sanitizeUserFacingErrorMessage(body.message, res.statusCode, true);
        }
      }
      return originalJson(body);
    };

    res.send = function (body: any) {
      if (typeof body === "string" && res.statusCode >= 400) {
        if (containsSensitiveErrorInfo(body)) {
          body = res.statusCode >= 500
            ? "An unexpected error occurred. Please try again later."
            : "Invalid request. Please verify your input and try again.";
        }
      }
      return originalSend(body);
    };
  }

  next();
}

/**
 * Global Express Error Handler Middleware:
 * Catches any uncaught exceptions or forwarded errors from routes/middleware.
 * Logs full error details & stack trace internally, and returns a sanitized generic JSON error to clients.
 */
export function globalErrorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (res.headersSent) {
    return next(err);
  }

  const statusCode =
    Number(err.statusCode || err.status) || (res.statusCode >= 400 ? res.statusCode : 500);

  // Always log the full technical details and stack trace internally
  logger.error(
    {
      err,
      message: err?.message,
      stack: err?.stack,
      statusCode,
      method: req.method,
      path: req.originalUrl || req.path,
      ip: req.ip,
      userId: (req.session as any)?.userId,
    },
    "Unhandled error intercepted by global error handler"
  );

  const safeMessage = sanitizeUserFacingErrorMessage(err?.message, statusCode);

  res.status(statusCode).json({
    error: safeMessage,
  });
}
