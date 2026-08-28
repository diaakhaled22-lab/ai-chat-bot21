import { Request, Response, NextFunction } from "express";
import { logger } from "./logger";

// ═══════════════════════════════════════════════════════════════════════════
// Rate Limiting — simple in-memory sliding-window limiter
// ═══════════════════════════════════════════════════════════════════════════

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore) {
    if (now > entry.resetAt) rateLimitStore.delete(key);
  }
}, 5 * 60 * 1000);

/**
 * Creates a rate-limiting middleware.
 * @param windowMs — time window in milliseconds
 * @param maxRequests — max requests allowed within the window
 * @param keyPrefix — optional prefix to namespace rate limits
 */
export function rateLimit(windowMs: number, maxRequests: number, keyPrefix = "rl") {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const key = `${keyPrefix}:${ip}`;
    const now = Date.now();

    let entry = rateLimitStore.get(key);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      rateLimitStore.set(key, entry);
    }

    entry.count++;

    res.setHeader("X-RateLimit-Limit", String(maxRequests));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, maxRequests - entry.count)));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > maxRequests) {
      logger.warn({ ip, key, count: entry.count }, "Rate limit exceeded");
      res.status(429).json({ error: "Too many requests. Please try again later." });
      return;
    }

    next();
  };
}

// Pre-built rate limiters for common use cases
/** Auth routes: 10 requests per 15 minutes */
export const authLimiter = rateLimit(15 * 60 * 1000, 10, "auth");
/** API routes: 60 requests per minute */
export const apiLimiter = rateLimit(60 * 1000, 60, "api");
/** Widget/chat routes: 30 requests per minute */
export const chatLimiter = rateLimit(60 * 1000, 30, "chat");
/** Webhook routes: 120 requests per minute */
export const webhookLimiter = rateLimit(60 * 1000, 120, "webhook");
/** Sensitive operations: 5 requests per hour */
export const sensitiveLimiter = rateLimit(60 * 60 * 1000, 5, "sensitive");

// ═══════════════════════════════════════════════════════════════════════════
// SSRF Protection — block internal/private URLs
// ═══════════════════════════════════════════════════════════════════════════

const PRIVATE_IP_RANGES = [
  /^127\./,                      // 127.0.0.0/8  loopback
  /^10\./,                       // 10.0.0.0/8   private
  /^172\.(1[6-9]|2\d|3[01])\./,  // 172.16.0.0/12 private
  /^192\.168\./,                 // 192.168.0.0/16 private
  /^169\.254\./,                 // 169.254.0.0/16 link-local
  /^0\./,                        // 0.0.0.0/8
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // 100.64.0.0/10 CGN
];

const BLOCKED_HOSTNAMES = [
  "localhost",
  "metadata.google.internal",
  "metadata.google",
  "169.254.169.254",
  "[::1]",
  "0.0.0.0",
];

/**
 * Validates that a URL is safe to fetch (not internal/private).
 * Returns `true` if the URL is safe, `false` if it should be blocked.
 */
export function isSafeUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);

    // Block non-HTTP(S) schemes
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return false;
    }

    const hostname = url.hostname.toLowerCase();

    // Block known internal hostnames
    if (BLOCKED_HOSTNAMES.includes(hostname)) {
      return false;
    }

    // Block private IP ranges
    for (const pattern of PRIVATE_IP_RANGES) {
      if (pattern.test(hostname)) {
        return false;
      }
    }

    // Block IPv6 shorthand for loopback
    if (hostname === "::1" || hostname === "[::1]") {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Validates a URL for SSRF and throws a descriptive error if blocked.
 */
export function validateUrlOrThrow(urlString: string, fieldName = "URL"): void {
  if (!urlString || typeof urlString !== "string") {
    throw new Error(`${fieldName} is required`);
  }
  if (!isSafeUrl(urlString)) {
    logger.warn({ url: urlString }, `SSRF blocked: ${fieldName} points to internal address`);
    throw new Error(`${fieldName} must be an external (public) URL. Internal/private addresses are not allowed.`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HTML Escaping — prevent XSS in email templates
// ═══════════════════════════════════════════════════════════════════════════

const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
  "/": "&#x2F;",
};

/**
 * Escapes HTML special characters to prevent XSS.
 */
export function escapeHtml(str: string): string {
  return String(str).replace(/[&<>"'/]/g, (char) => HTML_ESCAPE_MAP[char] || char);
}

// ═══════════════════════════════════════════════════════════════════════════
// API Key Masking — hide sensitive keys in API responses
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Masks an API key or token, showing only the first 4 and last 4 characters.
 * Returns empty string for null/undefined/empty values.
 */
export function maskApiKey(key: string | null | undefined): string {
  if (!key) return "";
  if (key.length <= 8) return "****";
  return `${key.slice(0, 4)}${"*".repeat(key.length - 8)}${key.slice(-4)}`;
}

/**
 * Given a company row, returns a sanitized version with all sensitive keys masked.
 */
export function maskCompanySecrets(company: Record<string, unknown>): Record<string, unknown> {
  const sensitiveFields = [
    "aiAgentApiKey",
    "serviceAccountKey",
    "telegramBotApiKey",
    "whatsappApiToken",
    "messengerApiKey",
  ];

  const result = { ...company };
  for (const field of sensitiveFields) {
    if (field in result && typeof result[field] === "string") {
      result[field] = maskApiKey(result[field] as string);
    }
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// Login Attempt Tracking — account lockout after repeated failures
// ═══════════════════════════════════════════════════════════════════════════

interface LoginAttempt {
  count: number;
  lockedUntil: number | null;
}

const loginAttempts = new Map<string, LoginAttempt>();

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

// Clean up old entries every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of loginAttempts) {
    if (entry.lockedUntil && now > entry.lockedUntil) {
      loginAttempts.delete(key);
    }
  }
}, 30 * 60 * 1000);

/**
 * Checks if a username is currently locked out.
 * Returns the remaining lockout time in seconds, or 0 if not locked.
 */
export function isAccountLocked(username: string): number {
  const entry = loginAttempts.get(username.toLowerCase());
  if (!entry?.lockedUntil) return 0;
  const remaining = entry.lockedUntil - Date.now();
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

/**
 * Records a failed login attempt. Returns true if the account is now locked.
 */
export function recordFailedLogin(username: string, ip: string): boolean {
  const key = username.toLowerCase();
  let entry = loginAttempts.get(key);
  if (!entry) {
    entry = { count: 0, lockedUntil: null };
    loginAttempts.set(key, entry);
  }

  entry.count++;
  logger.warn({ username: key, ip, attempts: entry.count }, "Failed login attempt");

  if (entry.count >= MAX_LOGIN_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
    logger.warn({ username: key, ip, lockoutMinutes: LOCKOUT_DURATION_MS / 60000 }, "Account locked due to too many failed attempts");
    return true;
  }

  return false;
}

/**
 * Resets the failed login counter on successful login.
 */
export function resetLoginAttempts(username: string): void {
  loginAttempts.delete(username.toLowerCase());
}

// ═══════════════════════════════════════════════════════════════════════════
// File Upload Validation
// ═══════════════════════════════════════════════════════════════════════════

const ALLOWED_UPLOAD_MIMETYPES = new Set([
  // Documents
  "application/pdf",
  "text/csv",
  "application/json",
  "text/plain",
  // Spreadsheets
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  // Images
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]);

/**
 * Validates that a file's mimetype is in the allowed list.
 */
export function isAllowedFileType(mimetype: string): boolean {
  return ALLOWED_UPLOAD_MIMETYPES.has(mimetype);
}

// ═══════════════════════════════════════════════════════════════════════════
// Security Headers Middleware
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Sets common security headers (lightweight alternative to helmet).
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
}

// ═══════════════════════════════════════════════════════════════════════════
// Password Policy
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validates password strength. Returns null if valid, or an error message.
 */
export function validatePassword(password: string): string | null {
  if (!password || password.length < 8) {
    return "Password must be at least 8 characters long";
  }
  if (!/[A-Z]/.test(password)) {
    return "Password must contain at least one uppercase letter";
  }
  if (!/[a-z]/.test(password)) {
    return "Password must contain at least one lowercase letter";
  }
  if (!/\d/.test(password)) {
    return "Password must contain at least one number";
  }
  return null;
}
