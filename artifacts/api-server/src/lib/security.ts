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
  // Content Security Policy — prevents XSS, clickjacking, data injection
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https:; frame-ancestors 'none';"
  );
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

// ═══════════════════════════════════════════════════════════════════════════
// Session Fixation Protection — regenerate session ID after login
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Regenerates the session ID while preserving session data.
 * Call this immediately after successful authentication to prevent
 * session fixation attacks.
 */
export function regenerateSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    const sessionData = { ...req.session } as Record<string, unknown>;
    req.session.regenerate((err) => {
      if (err) {
        logger.error({ err }, "Session regeneration failed");
        reject(err);
        return;
      }
      // Restore session data after regeneration
      Object.assign(req.session, sessionData);
      resolve();
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Session-IP Binding — detect session hijacking
// ═══════════════════════════════════════════════════════════════════════════

declare module "express-session" {
  interface SessionData {
    _boundIp?: string;
  }
}

/**
 * Middleware that binds a session to the client's IP address.
 * If the IP changes mid-session, the session is destroyed (potential hijacking).
 */
export function sessionIpBinding(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    next();
    return;
  }

  const currentIp = req.ip || req.socket.remoteAddress || "unknown";

  if (!req.session._boundIp) {
    // First request after login — bind the IP
    req.session._boundIp = currentIp;
    next();
    return;
  }

  if (req.session._boundIp !== currentIp) {
    logger.warn(
      { userId: req.session.userId, boundIp: req.session._boundIp, currentIp },
      "Session IP mismatch — possible session hijacking, destroying session"
    );
    req.session.destroy(() => {
      res.status(401).json({ error: "Session expired. Please log in again." });
    });
    return;
  }

  next();
}

// ═══════════════════════════════════════════════════════════════════════════
// Suspicious Activity Detection — detect & log attack patterns
// ═══════════════════════════════════════════════════════════════════════════

const ATTACK_PATTERNS = [
  /(\b(union|select|insert|update|delete|drop|alter|exec|execute)\b.*\b(from|into|table|database|where)\b)/i,
  /<script[\s>]/i,
  /javascript\s*:/i,
  /on(error|load|click|mouseover)\s*=/i,
  /\.\.\//g,                        // path traversal
  /\/etc\/(passwd|shadow)/i,        // Linux file access
  /\bcmd\b.*\/c\b/i,               // Windows command injection
  /\|\s*(ls|cat|whoami|id|curl|wget)\b/i, // pipe injection
  /\$\{.*\}/,                       // template injection
];

/**
 * Middleware that scans request body, query, and params for known attack patterns.
 * Logs warnings and blocks obviously malicious requests.
 */
export function suspiciousActivityDetector(req: Request, res: Response, next: NextFunction) {
  const stringsToCheck: string[] = [];

  // Collect all string values from body, query, params
  const collectStrings = (obj: unknown, depth = 0) => {
    if (depth > 5) return; // prevent deep recursion
    if (typeof obj === "string") {
      stringsToCheck.push(obj);
    } else if (Array.isArray(obj)) {
      obj.forEach(item => collectStrings(item, depth + 1));
    } else if (obj && typeof obj === "object") {
      Object.values(obj).forEach(val => collectStrings(val, depth + 1));
    }
  };

  collectStrings(req.body);
  collectStrings(req.query);
  collectStrings(req.params);

  for (const str of stringsToCheck) {
    for (const pattern of ATTACK_PATTERNS) {
      if (pattern.test(str)) {
        const ip = req.ip || req.socket.remoteAddress || "unknown";
        logger.warn(
          { ip, path: req.path, method: req.method, pattern: pattern.source, value: str.slice(0, 200) },
          "🚨 Suspicious activity detected — possible attack attempt"
        );
        res.status(400).json({ error: "Request blocked: invalid input detected." });
        return;
      }
    }
  }

  next();
}

// ═══════════════════════════════════════════════════════════════════════════
// Input Sanitizer — strip dangerous characters from string inputs
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Strips null bytes and other dangerous control characters from all
 * string values in the request body. Null bytes can bypass security
 * filters in many languages and databases.
 */
export function sanitizeInputs(req: Request, _res: Response, next: NextFunction) {
  const sanitize = (obj: unknown, depth = 0): unknown => {
    if (depth > 10) return obj;
    if (typeof obj === "string") {
      // Remove null bytes and other dangerous control chars (except \n, \r, \t)
      return obj.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
    }
    if (Array.isArray(obj)) {
      return obj.map(item => sanitize(item, depth + 1));
    }
    if (obj && typeof obj === "object") {
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(obj)) {
        result[key] = sanitize(val, depth + 1);
      }
      return result;
    }
    return obj;
  };

  if (req.body && typeof req.body === "object") {
    req.body = sanitize(req.body);
  }

  next();
}
