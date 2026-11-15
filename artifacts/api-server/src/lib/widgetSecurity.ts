/**
 * Security helpers for the website chatbot widget.
 * Protects against:
 * 1. AI token quota draining from unauthorized websites when widgetAllowedDomains is empty.
 * 2. Automated non-browser requests (curl, python scripts, bots).
 * 3. Session hijacking or rapid automated spamming within sessions.
 * 4. Cryptographically signed session tokens instead of relying on IP alone.
 * 5. Accurate daily message caps that count only requests that produced a message.
 */

import crypto from "crypto";

export interface ValidateWidgetResult {
  valid: boolean;
  status: number;
  error?: string;
  allowedOrigin?: string;
}

/**
 * Extracts and cleans allowed domains from the configured widgetAllowedDomains string,
 * falling back to the company's websiteDataUrl domain if no specific allowed domains are listed.
 */
export function parseAllowedDomains(
  widgetAllowedDomains?: string | null,
  websiteDataUrl?: string | null
): string[] {
  const domains: string[] = [];

  if (widgetAllowedDomains) {
    const rawList = widgetAllowedDomains.split(",");
    for (const raw of rawList) {
      const trimmed = raw.trim().toLowerCase();
      if (!trimmed) continue;
      try {
        if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
          const parsed = new URL(trimmed);
          const host = parsed.hostname.toLowerCase().replace(/\.+$/, "");
          if (host && !domains.includes(host)) domains.push(host);
        } else {
          const host = trimmed.replace(/^\*\./, "").split("/")[0].split(":")[0].replace(/\.+$/, "");
          if (host && !domains.includes(host)) domains.push(host);
        }
      } catch {
        const host = trimmed.replace(/\.+$/, "");
        if (host && !domains.includes(host)) domains.push(host);
      }
    }
  }

  // Fallback: If no explicit domains were configured, use the company's website URL domain
  if (domains.length === 0 && websiteDataUrl) {
    try {
      const trimmed = websiteDataUrl.trim().toLowerCase();
      const url = new URL(trimmed.startsWith("http://") || trimmed.startsWith("https://") ? trimmed : `https://${trimmed}`);
      const host = url.hostname.toLowerCase().replace(/\.+$/, "");
      if (host && !domains.includes(host)) domains.push(host);
    } catch {}
  }

  return domains;
}

/**
 * Checks whether an origin is allowed to access the widget.
 * - Always allows localhost and 127.0.0.1 for development and testing.
 * - Always allows the SaaS server host (dashboard preview).
 * - Matches against configured allowed domains (or websiteDataUrl fallback).
 * - CRITICAL: When no domains or website URLs are configured, REJECTS external origins
 *   to prevent token quota draining from arbitrary websites.
 */
export function isWidgetOriginAllowed(
  origin: string | undefined,
  widgetAllowedDomains?: string | null,
  websiteDataUrl?: string | null,
  serverHost?: string | null
): boolean {
  if (!origin) return false;

  let originHost = "";
  try {
    const url = new URL(origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    originHost = url.hostname.toLowerCase().replace(/\.+$/, "");
  } catch {
    return false;
  }

  if (!originHost) return false;

  // 1. Localhost and loopback
  if (originHost === "localhost" || originHost === "127.0.0.1") {
    return true;
  }

  // 2. SaaS platform dashboard preview (same-host)
  if (serverHost) {
    const cleanServerHost = serverHost.toLowerCase().trim().split(":")[0].replace(/\.+$/, "");
    if (cleanServerHost && (originHost === cleanServerHost || originHost.endsWith(`.${cleanServerHost}`))) {
      return true;
    }
  }

  // 3. Check allowed domains (with fallback to websiteDataUrl)
  const allowed = parseAllowedDomains(widgetAllowedDomains, websiteDataUrl);

  // If no allowed domains are configured, reject external origins to prevent quota drain
  if (allowed.length === 0) {
    return false;
  }

  // 4. Exact domain or subdomain match
  return allowed.some((domain) => originHost === domain || originHost.endsWith(`.${domain}`));
}

/**
 * Detects automated tools, CLI clients, and scraping libraries that lack real browser characteristics.
 */
export function isAutomatedOrNonBrowserAgent(userAgent: string | undefined): boolean {
  if (!userAgent || !userAgent.trim()) {
    return true; // Web browsers always include a User-Agent header
  }

  const ua = userAgent.toLowerCase().trim();
  const blockedPatterns = [
    /\bcurl\b/i,
    /python-requests/i,
    /python-urllib/i,
    /\baiohttp\b/i,
    /\bhttpx\b/i,
    /\bnode-fetch\b/i,
    /\baxios\b/i,
    /\bgot\b/i,
    /\bundici\b/i,
    /postmanruntime/i,
    /insomnia/i,
    /go-http-client/i,
    /^java\//i,
    /\bwget\b/i,
    /apache-httpclient/i,
    /\bokhttp\b/i,
    /libwww-perl/i,
    /httpclient/i,
    /powershell/i,
    /winhttp/i,
    /headlesschrome/i,
    /puppeteer/i,
    /selenium/i,
    /phantomjs/i,
  ];

  return blockedPatterns.some((pattern) => pattern.test(ua));
}

/**
 * Validates the widget session ID format to prevent arbitrary session key injection or tampering.
 */
export function isValidWidgetSessionId(sessionId: unknown): boolean {
  if (typeof sessionId !== "string") return false;
  const trimmed = sessionId.trim();
  return (
    /^ws_[a-fA-F0-9]{32,128}$/.test(trimmed) ||
    /^preview_[a-zA-Z0-9_-]{4,64}$/.test(trimmed) ||
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(trimmed)
  );
}

/**
 * In-memory sliding-window rate limiter per sessionId and client IP.
 * Prevents rapid automated spamming within a single conversation session
 * and prevents rotating session IDs from a single IP to exhaust AI quota.
 */
interface RateRecord {
  timestamps: number[];
}

const sessionRates = new Map<string, RateRecord>();
const ipRates = new Map<string, RateRecord>();

const RATE_WINDOW_MS = 60 * 1000; // 1 minute
const SESSION_MAX_MESSAGES_PER_WINDOW = 15; // Max 15 messages per minute per session
const IP_MAX_MESSAGES_PER_WINDOW = 30; // Max 30 messages per minute per client IP
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

let lastCleanup = Date.now();

function pruneRates(map: Map<string, RateRecord>, now: number) {
  for (const [key, record] of map.entries()) {
    record.timestamps = record.timestamps.filter((ts) => now - ts < RATE_WINDOW_MS);
    if (record.timestamps.length === 0) {
      map.delete(key);
    }
  }
}

export function checkWidgetRateLimit(
  sessionId: string,
  clientIp?: string | null
): { allowed: boolean; retryAfterSeconds?: number; reason?: "session" | "ip" } {
  const now = Date.now();

  // Periodic cleanup of stale entries
  if (now - lastCleanup > CLEANUP_INTERVAL_MS) {
    lastCleanup = now;
    pruneRates(sessionRates, now);
    pruneRates(ipRates, now);
  }

  // 1. IP-level rate limit check (prevents rotating session ID attacks)
  const cleanIp = (clientIp || "").replace(/^::ffff:/i, "").trim();
  if (cleanIp && cleanIp !== "unknown") {
    let ipRecord = ipRates.get(cleanIp);
    if (!ipRecord) {
      ipRecord = { timestamps: [] };
      ipRates.set(cleanIp, ipRecord);
    }
    ipRecord.timestamps = ipRecord.timestamps.filter((ts) => now - ts < RATE_WINDOW_MS);
    if (ipRecord.timestamps.length >= IP_MAX_MESSAGES_PER_WINDOW) {
      const oldest = ipRecord.timestamps[0];
      const retryAfterSeconds = Math.max(1, Math.ceil((oldest + RATE_WINDOW_MS - now) / 1000));
      return { allowed: false, retryAfterSeconds, reason: "ip" };
    }
  }

  // 2. Session-level rate limit check
  let record = sessionRates.get(sessionId);
  if (!record) {
    record = { timestamps: [] };
    sessionRates.set(sessionId, record);
  }

  record.timestamps = record.timestamps.filter((ts) => now - ts < RATE_WINDOW_MS);

  if (record.timestamps.length >= SESSION_MAX_MESSAGES_PER_WINDOW) {
    const oldest = record.timestamps[0];
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + RATE_WINDOW_MS - now) / 1000));
    return { allowed: false, retryAfterSeconds, reason: "session" };
  }

  // Record attempts
  record.timestamps.push(now);
  if (cleanIp && cleanIp !== "unknown") {
    ipRates.get(cleanIp)?.timestamps.push(now);
  }

  return { allowed: true };
}

export function checkSessionRateLimit(sessionId: string): { allowed: boolean; retryAfterSeconds?: number } {
  return checkWidgetRateLimit(sessionId);
}

/**
 * Validates incoming widget HTTP requests:
 * - Checks if widget is enabled for the company.
 * - Detects and blocks automated non-browser User-Agents.
 * - Requires either Origin or Referer header (browsers always send at least one).
 * - Enforces that both Origin and Referer (if present) are authorized domains.
 */
export function validateWidgetRequest(
  req: {
    headers: Record<string, string | string[] | undefined>;
  },
  company: {
    widgetAllowedDomains?: string | null;
    websiteDataUrl?: string | null;
    widgetEnabled?: boolean | null;
  },
  serverHost?: string | null
): ValidateWidgetResult {
  if (company.widgetEnabled === false) {
    return { valid: false, status: 403, error: "Website widget is disabled by administration" };
  }

  const rawUserAgent = req.headers["user-agent"];
  const userAgent = typeof rawUserAgent === "string" ? rawUserAgent : Array.isArray(rawUserAgent) ? rawUserAgent[0] : undefined;

  if (isAutomatedOrNonBrowserAgent(userAgent)) {
    return { valid: false, status: 403, error: "Automated non-browser requests are not permitted" };
  }

  const rawOrigin = req.headers.origin;
  const origin = typeof rawOrigin === "string" ? rawOrigin.trim() : undefined;

  const rawReferer = req.headers.referer;
  const referer = typeof rawReferer === "string" ? rawReferer.trim() : undefined;

  // Real browsers executing widget scripts always supply Origin (for POST/CORS) or Referer
  if (!origin && !referer) {
    return { valid: false, status: 403, error: "Widget requests must include a valid Origin or Referer header" };
  }

  let determinedOrigin: string | undefined;

  if (origin) {
    if (!isWidgetOriginAllowed(origin, company.widgetAllowedDomains, company.websiteDataUrl, serverHost)) {
      return { valid: false, status: 403, error: "Origin not allowed for this widget" };
    }
    determinedOrigin = origin;
  }

  if (referer) {
    let refererOrigin: string | undefined;
    try {
      refererOrigin = new URL(referer).origin;
    } catch {
      return { valid: false, status: 403, error: "Malformed Referer header" };
    }

    if (!isWidgetOriginAllowed(refererOrigin, company.widgetAllowedDomains, company.websiteDataUrl, serverHost)) {
      return { valid: false, status: 403, error: "Referer domain not allowed for this widget" };
    }

    if (!determinedOrigin) {
      determinedOrigin = refererOrigin;
    }
  }

  return { valid: true, status: 200, allowedOrigin: determinedOrigin };
}

/**
 * Cryptographically signed widget session token.
 * Prevents session forgery, tamper attacks, and enables secure per-session tracking
 * instead of relying on IP alone (which causes collisions behind corporate NAT/CGNAT).
 */
export interface WidgetSessionTokenPayload {
  sid: string;          // Session ID (e.g. ws_...)
  wk: string;           // Widget Key
  cid?: number;         // Company ID
  iat: number;          // Issued at epoch ms
  exp: number;          // Expiration epoch ms
}

let ephemeralWidgetSecret: string | null = null;

export function getWidgetSigningSecret(): string {
  if (process.env.WIDGET_SIGNING_SECRET?.trim()) {
    return process.env.WIDGET_SIGNING_SECRET.trim();
  }
  // Cryptographic key separation: Do NOT reuse SESSION_SECRET for signing public widget tokens.
  // Derive a dedicated domain-separated key from ENCRYPTION_KEY if available.
  const masterKey = process.env.ENCRYPTION_KEY?.trim();
  if (masterKey) {
    return crypto.createHmac("sha256", masterKey).update("ai-chat-bot:widget-session-signing-key:v1").digest("hex");
  }
  if (!ephemeralWidgetSecret) {
    ephemeralWidgetSecret = crypto.randomBytes(32).toString("hex");
  }
  return ephemeralWidgetSecret;
}

/**
 * Creates an HMAC-SHA256 signed session token for a widget visitor.
 */
export function createWidgetSessionToken(
  sessionId: string,
  widgetKey: string,
  companyId?: number,
  ttlMs = 7 * 24 * 60 * 60 * 1000 // 7 days session lifetime
): string {
  const now = Date.now();
  const payload: WidgetSessionTokenPayload = {
    sid: sessionId.trim(),
    wk: widgetKey.trim(),
    cid: companyId,
    iat: now,
    exp: now + ttlMs,
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", getWidgetSigningSecret())
    .update(payloadB64)
    .digest("base64url");

  return `${payloadB64}.${signature}`;
}

/**
 * Verifies a widget session token, ensuring signature validity, key match, and freshness.
 */
export function verifyWidgetSessionToken(
  token: string | null | undefined,
  expectedWidgetKey?: string
): { valid: boolean; payload?: WidgetSessionTokenPayload; error?: string } {
  if (!token || typeof token !== "string" || !token.includes(".")) {
    return { valid: false, error: "Missing or malformed widget session token" };
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return { valid: false, error: "Malformed widget session token structure" };
  }
  const [payloadB64, signature] = parts;

  const expectedSignature = crypto
    .createHmac("sha256", getWidgetSigningSecret())
    .update(payloadB64)
    .digest("base64url");

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSignature);

  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { valid: false, error: "Invalid widget session token signature" };
  }

  let payload: WidgetSessionTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return { valid: false, error: "Invalid widget session token payload JSON" };
  }

  if (Date.now() > payload.exp) {
    return { valid: false, error: "Widget session token has expired" };
  }

  if (expectedWidgetKey && payload.wk !== expectedWidgetKey) {
    return { valid: false, error: "Widget session token key mismatch" };
  }

  if (!isValidWidgetSessionId(payload.sid)) {
    return { valid: false, error: "Widget session token contains invalid sessionId" };
  }

  return { valid: true, payload };
}

/**
 * Daily message counters (in-memory sliding day reset).
 * Supports:
 * 1. Configurable limit per company (DB company.widgetDailyLimit or setCompanyDailyWidgetLimit).
 * 2. Per-session device limit anchored by signed session tokens (instead of relying on IP alone).
 * 3. Accurate accounting: counts ONLY requests that produced an actual message.
 */
const dailyWidgetMessageCounts = new Map<string, { count: number; resetAt: number }>();
const dailyWidgetSessionCounts = new Map<string, { count: number; resetAt: number }>();
const dailyWidgetIpCounts = new Map<string, { count: number; resetAt: number }>();
const companyDailyLimits = new Map<string, number>();

export const DEFAULT_DAILY_WIDGET_MESSAGE_LIMIT = 2000; // Default company daily messages cap across all users
export const MAX_ALLOWED_WIDGET_DAILY_LIMIT = 50000;   // Hard upper safety ceiling to prevent integer overflow / resource exhaustion
export const DEFAULT_DAILY_WIDGET_SESSION_LIMIT = 300;  // Default cap per session per widget per day
export const DEFAULT_DAILY_WIDGET_IP_LIMIT = 300;       // Default cap per client IP per widget per day (defense-in-depth)

export function setCompanyDailyWidgetLimit(widgetKey: string, limit: number): void {
  const boundedLimit = Math.min(MAX_ALLOWED_WIDGET_DAILY_LIMIT, Math.max(1, limit));
  companyDailyLimits.set(widgetKey, boundedLimit);
}

export function getCompanyDailyWidgetLimit(widgetKey: string, overrideLimit?: number | null): number {
  if (typeof overrideLimit === "number" && overrideLimit > 0) {
    return Math.min(MAX_ALLOWED_WIDGET_DAILY_LIMIT, Math.max(1, overrideLimit));
  }
  const configured = companyDailyLimits.get(widgetKey);
  if (typeof configured === "number" && configured > 0) {
    return Math.min(MAX_ALLOWED_WIDGET_DAILY_LIMIT, Math.max(1, configured));
  }
  const envVal = process.env.DAILY_WIDGET_MESSAGE_LIMIT;
  if (envVal) {
    const parsed = parseInt(envVal, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return Math.min(MAX_ALLOWED_WIDGET_DAILY_LIMIT, Math.max(1, parsed));
    }
  }
  return DEFAULT_DAILY_WIDGET_MESSAGE_LIMIT;
}

export interface CheckDailyWidgetLimitOptions {
  companyLimit?: number | null;
  clientIp?: string | null;
  consume?: boolean; // When false, checks availability without incrementing. Defaults to true when omitted.
}

/**
 * Checks if the daily message limit allows another message.
 * When consume !== false, it increments the counters immediately.
 * When consume === false, it checks whether the limit has been reached without incrementing.
 */
export function checkDailyWidgetLimit(
  widgetKey: string,
  identifierOrIp?: string | null,
  options?: CheckDailyWidgetLimitOptions
): { allowed: boolean; remaining: number; reason?: "widget" | "session" | "ip" } {
  const now = Date.now();
  const tomorrow = new Date();
  tomorrow.setUTCHours(24, 0, 0, 0);
  const resetAt = tomorrow.getTime();

  const maxCompanyLimit = getCompanyDailyWidgetLimit(widgetKey, options?.companyLimit);
  // Default consume to true if options is omitted or options.consume !== false (preserves compatibility with test runner calling checkDailyWidgetLimit in a loop)
  const shouldConsume = options?.consume !== false;

  const rawIdent = (identifierOrIp || "").trim();
  let effectiveSessionId: string | undefined;

  if (rawIdent.includes(".")) {
    const verified = verifyWidgetSessionToken(rawIdent, widgetKey);
    if (verified.valid && verified.payload) {
      effectiveSessionId = verified.payload.sid;
    }
  } else if (rawIdent.startsWith("ws_") || rawIdent.startsWith("preview_") || /^[0-9a-f-]{36}$/i.test(rawIdent)) {
    effectiveSessionId = rawIdent;
  }

  const cleanIp = (options?.clientIp || (!effectiveSessionId && (rawIdent.includes(".") || rawIdent.includes(":")) ? rawIdent : "")).replace(/^::ffff:/i, "").trim();

  // 1. Session-level daily limit (anchored by signed session token, immune to shared NAT/IP collisions)
  if (effectiveSessionId) {
    const sessionKey = `${widgetKey}:sess:${effectiveSessionId}`;
    let sessionRecord = dailyWidgetSessionCounts.get(sessionKey);
    if (!sessionRecord || now >= sessionRecord.resetAt) {
      sessionRecord = { count: 0, resetAt };
      dailyWidgetSessionCounts.set(sessionKey, sessionRecord);
    }
    if (sessionRecord.count >= DEFAULT_DAILY_WIDGET_SESSION_LIMIT) {
      return { allowed: false, remaining: 0, reason: "session" };
    }
    if (shouldConsume) {
      sessionRecord.count++;
    }
  }

  // 2. IP-level daily limit (applied when no session ID is supplied or as defense-in-depth)
  if (cleanIp && cleanIp !== "unknown" && !effectiveSessionId) {
    const ipKey = `${widgetKey}:${cleanIp}`;
    let ipRecord = dailyWidgetIpCounts.get(ipKey);
    if (!ipRecord || now >= ipRecord.resetAt) {
      ipRecord = { count: 0, resetAt };
      dailyWidgetIpCounts.set(ipKey, ipRecord);
    }
    if (ipRecord.count >= DEFAULT_DAILY_WIDGET_IP_LIMIT) {
      return { allowed: false, remaining: 0, reason: "ip" };
    }
    if (shouldConsume) {
      ipRecord.count++;
    }
  }

  // 3. Widget/Company-level daily limit (configurable per company)
  let record = dailyWidgetMessageCounts.get(widgetKey);
  if (!record || now >= record.resetAt) {
    record = { count: 0, resetAt };
    dailyWidgetMessageCounts.set(widgetKey, record);
  }

  if (record.count >= maxCompanyLimit) {
    return { allowed: false, remaining: 0, reason: "widget" };
  }

  if (shouldConsume) {
    record.count++;
  }

  return { allowed: true, remaining: Math.max(0, maxCompanyLimit - record.count) };
}

/**
 * Records that an AI response message was actually produced, incrementing the company, session, and IP daily counters.
 * MUST be called only after the AI successfully produces a response.
 */
export function recordDailyWidgetMessage(
  widgetKey: string,
  identifierOrIp?: string | null,
  clientIp?: string | null,
  companyLimit?: number | null
): void {
  checkDailyWidgetLimit(widgetKey, identifierOrIp, {
    companyLimit,
    clientIp,
    consume: true,
  });
}

// Sliding-window limiter for new widget session issuance per client IP (prevents mass session generation DoS - C3)
const newSessionIssuanceByIp = new Map<string, number[]>();
export const MAX_NEW_WIDGET_SESSIONS_PER_IP_HOURLY = 50;

/**
 * Checks and records whether a client IP is allowed to obtain a brand new widget session token.
 * Prevents malicious actors from churning thousands of fresh signed session tokens to evade limits.
 */
export function checkNewWidgetSessionIssuance(ip: string): boolean {
  const normIp = (ip || "unknown").replace(/^::ffff:/i, "").trim().toLowerCase();
  if (normIp === "127.0.0.1" || normIp === "::1" || normIp === "localhost") return true;

  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 1 hour window
  let timestamps = newSessionIssuanceByIp.get(normIp) || [];
  timestamps = timestamps.filter((t) => now - t <= windowMs);

  if (timestamps.length >= MAX_NEW_WIDGET_SESSIONS_PER_IP_HOURLY) {
    newSessionIssuanceByIp.set(normIp, timestamps);
    return false;
  }

  timestamps.push(now);
  newSessionIssuanceByIp.set(normIp, timestamps);
  return true;
}

// Clean up expired daily counters and session issuance records every hour
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of dailyWidgetMessageCounts) {
    if (now >= record.resetAt) dailyWidgetMessageCounts.delete(key);
  }
  for (const [key, record] of dailyWidgetSessionCounts) {
    if (now >= record.resetAt) dailyWidgetSessionCounts.delete(key);
  }
  for (const [key, record] of dailyWidgetIpCounts) {
    if (now >= record.resetAt) dailyWidgetIpCounts.delete(key);
  }
  const windowMs = 60 * 60 * 1000;
  for (const [ip, timestamps] of newSessionIssuanceByIp) {
    const valid = timestamps.filter((t) => now - t <= windowMs);
    if (valid.length === 0) {
      newSessionIssuanceByIp.delete(ip);
    } else {
      newSessionIssuanceByIp.set(ip, valid);
    }
  }
}, 60 * 60 * 1000).unref();
