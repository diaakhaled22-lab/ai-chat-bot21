/**
 * Security helpers for the website chatbot widget.
 * Protects against:
 * 1. AI token quota draining from unauthorized websites when widgetAllowedDomains is empty.
 * 2. Automated non-browser requests (curl, python scripts, bots).
 * 3. Session hijacking or rapid automated spamming within sessions.
 *
 * DEFENSE-IN-DEPTH NOTE:
 * Origin, Referer, and User-Agent header checks are spoofable by determined attackers.
 * They provide a reasonable barrier against casual abuse and automated scripts, but
 * the primary protection against token quota drain is the per-company monthly token
 * quota enforced in the widget chat handler (assertCompanyQuotaNotExceeded).
 *
 * MULTI-INSTANCE DEPLOYMENT NOTE:
 * The in-memory rate limiters (sessionRates, ipRates) are local to each process.
 * In multi-instance deployments behind a load balancer, consider using Redis or a
 * shared store for rate limiting. The per-company DB-level quota check already
 * provides cross-instance protection for token consumption.
 */

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
 * Per-widget-key daily message counter (in-memory).
 * Provides a daily message cap per widget key and per client IP as an additional layer
 * on top of the monthly token quota.
 * In multi-instance deployments, this can be backed by Redis or a shared datastore;
 * the DB-level monthly token quota check remains the authoritative cross-instance limit.
 */
const dailyWidgetMessageCounts = new Map<string, { count: number; resetAt: number }>();
const dailyWidgetIpCounts = new Map<string, { count: number; resetAt: number }>();
const DAILY_WIDGET_MESSAGE_LIMIT = 2000; // Max messages per widget key per day across all users
const DAILY_WIDGET_IP_LIMIT = 300; // Max messages per client IP per widget per day (prevents single IP DoS)

export function checkDailyWidgetLimit(
  widgetKey: string,
  clientIp?: string | null
): { allowed: boolean; remaining: number; reason?: "widget" | "ip" } {
  const now = Date.now();
  const tomorrow = new Date();
  tomorrow.setUTCHours(24, 0, 0, 0);
  const resetAt = tomorrow.getTime();

  // 1. IP-level daily limit per widget key (prevents single malicious IP from exhausting company daily limit)
  const cleanIp = (clientIp || "").replace(/^::ffff:/i, "").trim();
  if (cleanIp && cleanIp !== "unknown") {
    const ipKey = `${widgetKey}:${cleanIp}`;
    let ipRecord = dailyWidgetIpCounts.get(ipKey);
    if (!ipRecord || now >= ipRecord.resetAt) {
      ipRecord = { count: 0, resetAt };
      dailyWidgetIpCounts.set(ipKey, ipRecord);
    }
    if (ipRecord.count >= DAILY_WIDGET_IP_LIMIT) {
      return { allowed: false, remaining: 0, reason: "ip" };
    }
    ipRecord.count++;
  }

  // 2. Widget-level daily limit
  let record = dailyWidgetMessageCounts.get(widgetKey);
  if (!record || now >= record.resetAt) {
    record = { count: 0, resetAt };
    dailyWidgetMessageCounts.set(widgetKey, record);
  }

  if (record.count >= DAILY_WIDGET_MESSAGE_LIMIT) {
    return { allowed: false, remaining: 0, reason: "widget" };
  }

  record.count++;
  return { allowed: true, remaining: DAILY_WIDGET_MESSAGE_LIMIT - record.count };
}

// Clean up expired daily counters every hour
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of dailyWidgetMessageCounts) {
    if (now >= record.resetAt) dailyWidgetMessageCounts.delete(key);
  }
  for (const [key, record] of dailyWidgetIpCounts) {
    if (now >= record.resetAt) dailyWidgetIpCounts.delete(key);
  }
}, 60 * 60 * 1000).unref();
