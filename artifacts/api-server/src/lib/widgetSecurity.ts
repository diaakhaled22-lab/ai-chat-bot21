/**
 * Security helpers for the website chatbot widget.
 * Protects against:
 * 1. AI token quota draining from unauthorized websites when widgetAllowedDomains is empty.
 * 2. Automated non-browser requests (curl, python scripts, bots).
 * 3. Session hijacking or rapid automated spamming within sessions.
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
 * In-memory sliding-window rate limiter per sessionId.
 * Prevents rapid automated spamming within a single conversation session from exhausting AI quota.
 */
interface SessionRateRecord {
  timestamps: number[];
}

const sessionRates = new Map<string, SessionRateRecord>();
const SESSION_RATE_WINDOW_MS = 60 * 1000; // 1 minute
const SESSION_MAX_MESSAGES_PER_WINDOW = 15; // Max 15 messages per minute per session
const SESSION_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

let lastCleanup = Date.now();

export function checkSessionRateLimit(sessionId: string): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();

  // Periodic cleanup of stale entries
  if (now - lastCleanup > SESSION_CLEANUP_INTERVAL_MS) {
    lastCleanup = now;
    for (const [sid, record] of sessionRates.entries()) {
      record.timestamps = record.timestamps.filter((ts) => now - ts < SESSION_RATE_WINDOW_MS);
      if (record.timestamps.length === 0) {
        sessionRates.delete(sid);
      }
    }
  }

  let record = sessionRates.get(sessionId);
  if (!record) {
    record = { timestamps: [] };
    sessionRates.set(sessionId, record);
  }

  record.timestamps = record.timestamps.filter((ts) => now - ts < SESSION_RATE_WINDOW_MS);

  if (record.timestamps.length >= SESSION_MAX_MESSAGES_PER_WINDOW) {
    const oldest = record.timestamps[0];
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + SESSION_RATE_WINDOW_MS - now) / 1000));
    return { allowed: false, retryAfterSeconds };
  }

  record.timestamps.push(now);
  return { allowed: true };
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
