import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { logger } from "./logger";
import { db, adminConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sendSecurityEventEmail } from "./email";

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
 * Limits the number of mask asterisks to prevent layout distortion and secret length leakage.
 * Returns empty string for null/undefined/empty values.
 */
export function maskApiKey(key: string | null | undefined): string {
  if (!key) return "";
  const trimmed = key.trim();
  if (trimmed.length <= 8) return "****";
  const maskLength = Math.min(Math.max(trimmed.length - 8, 4), 12);
  return `${trimmed.slice(0, 4)}${"*".repeat(maskLength)}${trimmed.slice(-4)}`;
}

export function preserveMaskedSecret(
  nextValue: string | null | undefined,
  existingValue: string | null | undefined,
): string | null | undefined {
  if (nextValue === undefined || nextValue === null) {
    return nextValue;
  }
  const trimmed = typeof nextValue === "string" ? nextValue.trim() : "";
  if (trimmed === "") {
    return null;
  }
  const isMaskPattern =
    trimmed.includes("••••") ||
    trimmed.includes("****") ||
    /^[\u2022\*\.]{3,}$/.test(trimmed) ||
    trimmed.startsWith("••••") ||
    (existingValue ? trimmed === maskApiKey(existingValue) : false);

  if (isMaskPattern) {
    return existingValue || null;
  }
  return trimmed;
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
    "resendApiKey",
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
  failureTimes: number[];
  lockedUntil: number | null;
  postLockoutFailures: number;
  warningSent: boolean;
}

interface IpLoginAttempt {
  failureTimes: number[];
  warningSent: boolean;
}

export type AttackLogEvent = "failed_attempt" | "warning_triggered" | "account_locked" | "blocked_attempt" | "ip_blocked" | "manual_ip_blocked" | "ip_unblocked";

export interface AttackLogEntry {
  id: number;
  ip: string;
  time: string;
  username: string;
  failedAttempts: number;
  event: AttackLogEvent;
}

export interface AttackMetric {
  value: string;
  count: number;
}

export interface AttackSpikeAlert {
  active: boolean;
  threshold: number;
  recentFailedAttempts: number;
  windowMinutes: number;
  message: string | null;
}

export interface FailedLoginResult {
  accountLocked: boolean;
  spikeDetected: boolean;
  recentFailedAttempts: number;
}

export interface AttackMonitoringSnapshot {
  logs: AttackLogEntry[];
  blockedIps: Array<{ ip: string; blockedAt: string }>;
  analytics: {
    totalFailedAttempts: number;
    recentFailedAttempts: number;
    activeIps: AttackMetric[];
    targetedAccounts: AttackMetric[];
    spikeAlert: AttackSpikeAlert;
  };
  policy: {
    warningThreshold: number;
    maxFailedAttempts: number;
    failureWindowMinutes: number;
    accountLockoutMinutes: number;
    additionalAttemptsBeforeIpBlock: number;
  };
}

const loginAttempts = new Map<string, LoginAttempt>();
const blockedIps = new Map<string, number>();
const attackLogs: AttackLogEntry[] = [];
let nextAttackLogId = 1;

export async function loadBlockedIpsFromDb() {
  try {
    const [row] = await db.select().from(adminConfigTable).where(eq(adminConfigTable.key, "blocked_ips"));
    if (row && row.value) {
      const ips: Record<string, number> = JSON.parse(row.value);
      for (const [ip, timestamp] of Object.entries(ips)) {
        if (!isLoopbackIp(ip)) {
          blockedIps.set(ip, timestamp);
        }
      }
    }
  } catch (err) {
    logger.error({ err }, "Failed to load blocked IPs from DB");
  }
}

async function saveBlockedIpsToDb() {
  try {
    const ips = Object.fromEntries(blockedIps);
    const value = JSON.stringify(ips);
    const [existing] = await db.select().from(adminConfigTable).where(eq(adminConfigTable.key, "blocked_ips"));
    if (existing) {
      await db.update(adminConfigTable).set({ value }).where(eq(adminConfigTable.key, "blocked_ips"));
    } else {
      await db.insert(adminConfigTable).values({ key: "blocked_ips", value });
    }
  } catch (err) {
    logger.error({ err }, "Failed to save blocked IPs to DB");
  }
}

const totpSecrets = new Map<number, string>();

export async function loadTotpSecretsFromDb() {
  try {
    const [row] = await db.select().from(adminConfigTable).where(eq(adminConfigTable.key, "totp_secrets"));
    if (row && row.value) {
      const secrets: Record<string, string> = JSON.parse(row.value);
      for (const [userIdStr, secret] of Object.entries(secrets)) {
        totpSecrets.set(Number(userIdStr), secret);
      }
    }
  } catch (err) {
    logger.error({ err }, "Failed to load TOTP secrets from DB");
  }
}

async function saveTotpSecretsToDb() {
  try {
    const secrets = Object.fromEntries(totpSecrets);
    const value = JSON.stringify(secrets);
    const [existing] = await db.select().from(adminConfigTable).where(eq(adminConfigTable.key, "totp_secrets"));
    if (existing) {
      await db.update(adminConfigTable).set({ value }).where(eq(adminConfigTable.key, "totp_secrets"));
    } else {
      await db.insert(adminConfigTable).values({ key: "totp_secrets", value });
    }
  } catch (err) {
    logger.error({ err }, "Failed to save TOTP secrets to DB");
  }
}

export function getTotpSecret(userId: number): string | undefined {
  return totpSecrets.get(userId);
}

export function setTotpSecret(userId: number, secret: string): void {
  totpSecrets.set(userId, secret);
  void saveTotpSecretsToDb();
}

export function removeTotpSecret(userId: number): void {
  totpSecrets.delete(userId);
  void saveTotpSecretsToDb();
}

const WARNING_LOGIN_ATTEMPTS = 3;
const MAX_LOGIN_ATTEMPTS = 5;
const FAILURE_WINDOW_MS = 5 * 60 * 1000;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;
const MAX_ATTACK_LOG_ENTRIES = 500;
const SPIKE_ALERT_THRESHOLD = 10;
let lastSpikeAlertAt = 0;

const ipLoginAttempts = new Map<string, IpLoginAttempt>();

export function isLoopbackIp(ip: string): boolean {
  const clean = ip.replace(/^::ffff:/, "").trim().toLowerCase();
  return clean === "127.0.0.1" || clean === "::1" || clean === "localhost" || clean === "unknown";
}

function normalizeIp(ip: string): string {
  return ip.trim() || "unknown";
}

function appendAttackLog(
  ip: string,
  username: string,
  failedAttempts: number,
  event: AttackLogEvent,
  timestamp = Date.now(),
): void {
  attackLogs.push({
    id: nextAttackLogId++,
    ip: normalizeIp(ip),
    time: new Date(timestamp).toISOString(),
    username: username.trim() || "(unknown)",
    failedAttempts,
    event,
  });

  if (attackLogs.length > MAX_ATTACK_LOG_ENTRIES) {
    attackLogs.splice(0, attackLogs.length - MAX_ATTACK_LOG_ENTRIES);
  }
}

function getOrCreateLoginAttempt(username: string): LoginAttempt {
  const key = username.toLowerCase();
  let entry = loginAttempts.get(key);
  if (!entry) {
    entry = { failureTimes: [], lockedUntil: null, postLockoutFailures: 0, warningSent: false };
    loginAttempts.set(key, entry);
  }
  return entry;
}

// Clean up old failure windows and expired account lockouts every 30 minutes.
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of loginAttempts) {
    entry.failureTimes = entry.failureTimes.filter((time) => now - time <= FAILURE_WINDOW_MS);
    if (entry.failureTimes.length < WARNING_LOGIN_ATTEMPTS) {
      entry.warningSent = false;
    }
    if (entry.lockedUntil && now > entry.lockedUntil) {
      entry.lockedUntil = null;
      entry.failureTimes = [];
      entry.warningSent = false;
    }
    if (!entry.lockedUntil && entry.failureTimes.length === 0 && entry.postLockoutFailures === 0) {
      loginAttempts.delete(key);
    }
  }

  for (const [ipKey, ipEntry] of ipLoginAttempts) {
    ipEntry.failureTimes = ipEntry.failureTimes.filter((time) => now - time <= FAILURE_WINDOW_MS);
    if (ipEntry.failureTimes.length < WARNING_LOGIN_ATTEMPTS) {
      ipEntry.warningSent = false;
    }
    if (ipEntry.failureTimes.length === 0) {
      ipLoginAttempts.delete(ipKey);
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
 * Checks whether the source IP has been blocked after repeated attempts during
 * an account lockout.
 */
export function isIpBlocked(ip: string): boolean {
  const norm = normalizeIp(ip);
  if (isLoopbackIp(norm)) return false;
  return blockedIps.has(norm);
}

/**
 * Records an attempted login while the account is already locked. Five such
 * attempts trigger a source-IP block.
 */
export function recordBlockedLoginAttempt(username: string, ip: string): boolean {
  const entry = getOrCreateLoginAttempt(username);
  entry.postLockoutFailures++;
  const attempts = MAX_LOGIN_ATTEMPTS + entry.postLockoutFailures;
  appendAttackLog(ip, username, attempts, "blocked_attempt");

  if (entry.postLockoutFailures >= MAX_LOGIN_ATTEMPTS) {
    const normalizedIp = normalizeIp(ip);
    if (!isLoopbackIp(normalizedIp) && !blockedIps.has(normalizedIp)) {
      blockedIps.set(normalizedIp, Date.now());
      void saveBlockedIpsToDb();
      void sendSecurityEventEmail("ip_blocked", normalizedIp, username, attempts);
      appendAttackLog(ip, username, attempts, "ip_blocked");
      logger.warn(
        { username: username.toLowerCase(), ip: normalizedIp, attempts },
        "IP blocked after suspicious activity during account lockout",
      );
    }
    return true;
  }

  return false;
}

/**
 * Records a failed login attempt. Returns true if the account is now locked.
 * Automatically triggers warning notification (bell icon + email) when consecutive
 * failed attempts reach the warning threshold (3 attempts).
 */
export function recordFailedLogin(username: string, ip: string): FailedLoginResult {
  const cleanUsername = username.trim() || "(unknown)";
  const normUser = cleanUsername.toLowerCase();
  const normalizedIp = normalizeIp(ip);
  const now = Date.now();

  // 1. Account-level tracking
  const entry = getOrCreateLoginAttempt(normUser);
  entry.failureTimes = entry.failureTimes.filter((time) => now - time <= FAILURE_WINDOW_MS);
  entry.failureTimes.push(now);
  const userAttempts = entry.failureTimes.length;

  // 2. IP-level tracking
  let ipEntry = ipLoginAttempts.get(normalizedIp);
  if (!ipEntry) {
    ipEntry = { failureTimes: [], warningSent: false };
    ipLoginAttempts.set(normalizedIp, ipEntry);
  }
  ipEntry.failureTimes = ipEntry.failureTimes.filter((time) => now - time <= FAILURE_WINDOW_MS);
  ipEntry.failureTimes.push(now);
  const ipAttempts = ipEntry.failureTimes.length;

  const currentAttempts = Math.max(userAttempts, ipAttempts);
  appendAttackLog(normalizedIp, cleanUsername, currentAttempts, "failed_attempt", now);
  logger.warn({ username: normUser, ip: normalizedIp, userAttempts, ipAttempts }, "Failed login attempt");

  const recentFailedAttempts = attackLogs.filter(
    (log) => log.event === "failed_attempt" && now - new Date(log.time).getTime() <= FAILURE_WINDOW_MS,
  ).length;
  const spikeDetected =
    recentFailedAttempts >= SPIKE_ALERT_THRESHOLD
    && (lastSpikeAlertAt === 0 || now - lastSpikeAlertAt >= FAILURE_WINDOW_MS);
  if (spikeDetected) {
    lastSpikeAlertAt = now;
    logger.warn(
      { recentFailedAttempts, windowMinutes: FAILURE_WINDOW_MS / 60000, threshold: SPIKE_ALERT_THRESHOLD },
      "Sudden failed-login spike detected",
    );
  }

  // 3. Early Warning: Trigger bell notification + email upon reaching WARNING_LOGIN_ATTEMPTS (3 attempts)
  const shouldWarnUser = userAttempts >= WARNING_LOGIN_ATTEMPTS && !entry.warningSent;
  const shouldWarnIp = ipAttempts >= WARNING_LOGIN_ATTEMPTS && !ipEntry.warningSent;

  if (shouldWarnUser || shouldWarnIp) {
    if (shouldWarnUser) entry.warningSent = true;
    if (shouldWarnIp) ipEntry.warningSent = true;

    appendAttackLog(normalizedIp, cleanUsername, currentAttempts, "warning_triggered", now);
    void sendSecurityEventEmail("failed_attempts_warning", normalizedIp, cleanUsername, currentAttempts);
    logger.warn(
      { username: normUser, ip: normalizedIp, attempts: currentAttempts },
      "Consecutive failed login warning triggered (bell notification + email dispatched)",
    );
  }

  // 4. Account Lockout: Trigger account lockout upon reaching MAX_LOGIN_ATTEMPTS (5 attempts)
  const accountLocked = userAttempts >= MAX_LOGIN_ATTEMPTS;

  if (accountLocked) {
    // Only send the email on the EXACT attempt that triggers the lock (so we don't spam it)
    if (userAttempts === MAX_LOGIN_ATTEMPTS) {
      void sendSecurityEventEmail("account_locked", normalizedIp, cleanUsername, userAttempts);
    }
    
    entry.lockedUntil = now + LOCKOUT_DURATION_MS;
    appendAttackLog(normalizedIp, cleanUsername, userAttempts, "account_locked", now);
    logger.warn({ username: normUser, ip: normalizedIp, lockoutMinutes: LOCKOUT_DURATION_MS / 60000 }, "Account locked due to too many failed attempts");
  }

  return {
    accountLocked,
    spikeDetected,
    recentFailedAttempts,
  };
}

function getAttackAnalytics(now = Date.now()): AttackMonitoringSnapshot["analytics"] {
  const failedLogs = attackLogs.filter((log) => log.event === "failed_attempt");
  const recentStart = now - FAILURE_WINDOW_MS;
  const recentLogs = failedLogs.filter((log) => new Date(log.time).getTime() >= recentStart);

  const countBy = (values: string[]): AttackMetric[] => {
    const counts = new Map<string, number>();
    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
    return [...counts.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
      .slice(0, 5);
  };

  const recentFailedAttempts = recentLogs.length;
  const spikeAlertActive = recentFailedAttempts >= SPIKE_ALERT_THRESHOLD;

  return {
    totalFailedAttempts: failedLogs.length,
    recentFailedAttempts,
    activeIps: countBy(recentLogs.map((log) => log.ip)),
    targetedAccounts: countBy(recentLogs.map((log) => log.username)),
    spikeAlert: {
      active: spikeAlertActive,
      threshold: SPIKE_ALERT_THRESHOLD,
      recentFailedAttempts,
      windowMinutes: FAILURE_WINDOW_MS / 60000,
      message: spikeAlertActive
        ? `${recentFailedAttempts} failed login attempts were recorded within the last ${FAILURE_WINDOW_MS / 60000} minutes.`
        : null,
    },
  };
}

/**
 * Returns the newest attack-monitoring entries and the currently blocked IPs.
 */
export function getAttackMonitoringSnapshot(): AttackMonitoringSnapshot {
  return {
    logs: [...attackLogs].reverse(),
    analytics: getAttackAnalytics(),
    blockedIps: [...blockedIps.entries()]
      .map(([ip, blockedAt]) => ({ ip, blockedAt: new Date(blockedAt).toISOString() }))
      .sort((a, b) => b.blockedAt.localeCompare(a.blockedAt)),
    policy: {
      warningThreshold: WARNING_LOGIN_ATTEMPTS,
      maxFailedAttempts: MAX_LOGIN_ATTEMPTS,
      failureWindowMinutes: FAILURE_WINDOW_MS / 60000,
      accountLockoutMinutes: LOCKOUT_DURATION_MS / 60000,
      additionalAttemptsBeforeIpBlock: MAX_LOGIN_ATTEMPTS,
    },
  };
}

/**
 * Resets the failed login counter on successful login.
 */
export function resetLoginAttempts(username: string, ip?: string): void {
  loginAttempts.delete(username.toLowerCase());
  if (ip) {
    ipLoginAttempts.delete(normalizeIp(ip));
  }
}

export function manualBlockIp(ip: string): void {
  const normalizedIp = normalizeIp(ip);
  if (!blockedIps.has(normalizedIp)) {
    blockedIps.set(normalizedIp, Date.now());
    void saveBlockedIpsToDb();
    appendAttackLog(normalizedIp, "Admin", 0, "manual_ip_blocked");
    logger.info({ ip: normalizedIp }, "IP manually blocked by admin");
  }
}

export function manualUnblockIp(ip: string): void {
  const normalizedIp = normalizeIp(ip);
  if (blockedIps.has(normalizedIp)) {
    blockedIps.delete(normalizedIp);
    void saveBlockedIpsToDb();
    appendAttackLog(normalizedIp, "Admin", 0, "ip_unblocked");
    logger.info({ ip: normalizedIp }, "IP manually unblocked by admin");
  }
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
// Session Anomaly Detection — smart session hijacking detection
// ═══════════════════════════════════════════════════════════════════════════

declare module "express-session" {
  interface SessionData {
    _fingerprint?: {
      ip: string;
      userAgent: string;
      ipChanges: number;
      lastSeen: number;
    };
  }
}

const ANOMALY_THRESHOLDS = {
  /** Max IP changes allowed within a single session before flagging */
  maxIpChanges: 5,
  /** If IP + User-Agent both change at once → instant kill (score = 100) */
  dualChangeScore: 100,
  /** Score added per IP change */
  ipChangeScore: 25,
  /** Score added if User-Agent changed */
  uaChangeScore: 60,
  /** Score threshold to destroy the session */
  killThreshold: 80,
};

/**
 * Middleware that detects session anomalies using multiple signals:
 * - IP address changes (common for mobile/VPN — tolerated individually)
 * - User-Agent changes (rare for legitimate users)
 * - Rapid IP hopping (many IP changes in a short time)
 *
 * Unlike strict IP binding, this allows normal network switches (WiFi→4G)
 * but catches real hijacking where both IP and User-Agent change at once.
 */
export function sessionAnomalyDetector(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    next();
    return;
  }

  const currentIp = req.ip || req.socket.remoteAddress || "unknown";
  const currentUa = req.headers["user-agent"] || "unknown";

  // First request after login — record the fingerprint
  if (!req.session._fingerprint) {
    req.session._fingerprint = {
      ip: currentIp,
      userAgent: currentUa,
      ipChanges: 0,
      lastSeen: Date.now(),
    };
    next();
    return;
  }

  const fp = req.session._fingerprint;
  let anomalyScore = 0;
  const flags: string[] = [];

  // Check IP change
  const ipChanged = fp.ip !== currentIp;
  if (ipChanged) {
    fp.ipChanges++;
    anomalyScore += ANOMALY_THRESHOLDS.ipChangeScore;
    flags.push(`ip_changed(${fp.ip}→${currentIp}, count=${fp.ipChanges})`);
  }

  // Check User-Agent change
  const uaChanged = fp.userAgent !== currentUa;
  if (uaChanged) {
    anomalyScore += ANOMALY_THRESHOLDS.uaChangeScore;
    flags.push(`ua_changed`);
  }

  // Both changed at once — very suspicious
  if (ipChanged && uaChanged) {
    anomalyScore = ANOMALY_THRESHOLDS.dualChangeScore;
    flags.push("dual_change");
  }

  // Too many IP changes — rapid hopping
  if (fp.ipChanges > ANOMALY_THRESHOLDS.maxIpChanges) {
    anomalyScore += 30;
    flags.push(`rapid_ip_hop(${fp.ipChanges})`);
  }

  // Kill session if anomaly score exceeds threshold
  if (anomalyScore >= ANOMALY_THRESHOLDS.killThreshold) {
    logger.warn(
      { userId: req.session.userId, score: anomalyScore, flags, currentIp, originalIp: fp.ip },
      "🚨 Session anomaly detected — destroying session (possible hijacking)"
    );
    req.session.destroy(() => {
      res.status(401).json({ error: "Session expired due to unusual activity. Please log in again." });
    });
    return;
  }

  // Log moderate anomalies without killing
  if (anomalyScore > 0) {
    logger.info(
      { userId: req.session.userId, score: anomalyScore, flags, currentIp },
      "Session anomaly noted (within tolerance)"
    );
  }

  // Update fingerprint
  fp.ip = currentIp;
  fp.userAgent = currentUa;
  fp.lastSeen = Date.now();

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
  // Skip check for endpoints that intentionally accept URLs with path segments or verified external webhooks
  const urlAcceptingPaths = [
    "/client/wordpress",
    "/client/wordpress/test",
    "/client/rest-api",
    "/client/rest-api/test",
    "/client/shopify",
    "/client/shopify/test",
    "/client/company/sync-website",
    "/client/company",
    "/api/whatsapp/webhook",
    "/whatsapp/webhook",
    "/api/webhook/whatsapp",
    "/webhook/whatsapp",
    "/api/messenger/webhook",
    "/messenger/webhook",
    "/api/webhook/messenger",
    "/webhook/messenger",
    "/api/telegram/webhook",
    "/telegram/webhook",
    "/api/webhook/telegram",
    "/webhook/telegram",
    "/api/webhook/message",
    "/webhook/message",
    "/api/webhook",
    "/webhook",
  ];
  if (urlAcceptingPaths.some((p) => req.path.startsWith(p))) {
    return next();
  }

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
      // Reset lastIndex for patterns with /g flag to avoid false negatives
      if (pattern.global) pattern.lastIndex = 0;
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
