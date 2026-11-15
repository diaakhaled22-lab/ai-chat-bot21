import { logger } from "./logger";

export interface TrustProxyResolution {
  value: boolean | number | string | string[];
  source: "explicit_env" | "known_platform" | "direct_default";
  platformName?: string;
  reason: string;
}

/**
 * Detects whether the runtime environment matches a known cloud PaaS / container platform
 * where reverse proxies or ingress controllers are guaranteed to manage X-Forwarded-* headers and terminate TLS.
 */
export function detectKnownProxyPlatform(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.REPLIT_DEV_DOMAIN || env.REPLIT_CLUSTER || env.REPL_ID) return "Replit";
  if (env.K_SERVICE || env.K_REVISION) return "Google Cloud Run";
  if (env.RENDER || env.RENDER_SERVICE_ID) return "Render";
  if (env.RAILWAY_ENVIRONMENT || env.RAILWAY_STATIC_URL) return "Railway";
  if (env.VERCEL || env.VERCEL_ENV) return "Vercel";
  if (env.HEROKU_APP_ID || env.DYNO) return "Heroku";
  if (env.FLY_ALLOC_ID || env.FLY_APP_NAME) return "Fly.io";
  if (env.CF_PAGES || env.CF_PAGES_URL) return "Cloudflare Pages";
  if (env.DIGITALOCEAN_APP_ID) return "DigitalOcean App Platform";
  if (env.AWS_LAMBDA_FUNCTION_NAME || env.AWS_EXECUTION_ENV) return "AWS Lambda";
  if (env.NETLIFY) return "Netlify";

  return null;
}

/**
 * Resolves Express `trust proxy` setting safely:
 * - If `TRUSTED_PROXIES` is set: parses boolean, numeric hops, or specific IP/subnet list.
 * - Else if running on a known cloud PaaS / container platform: sets `1` (single ingress hop).
 * - Else (standalone VPS / bare-metal production without known proxy): strictly defaults to `false`.
 *   This prevents untrusted clients from spoofing `X-Forwarded-For` to bypass rate limits, lockout, and IP security.
 */
export function resolveTrustProxySetting(env: NodeJS.ProcessEnv = process.env): TrustProxyResolution {
  const rawTrustedProxies = env.TRUSTED_PROXIES?.trim();

  if (rawTrustedProxies !== undefined && rawTrustedProxies !== "") {
    if (rawTrustedProxies === "false" || rawTrustedProxies === "0") {
      return {
        value: false,
        source: "explicit_env",
        reason: "Explicitly disabled via TRUSTED_PROXIES",
      };
    }

    if (rawTrustedProxies === "true" || rawTrustedProxies === "1") {
      return {
        value: 1,
        source: "explicit_env",
        reason: "Explicitly set to 1 hop via TRUSTED_PROXIES",
      };
    }

    const numericHops = Number(rawTrustedProxies);
    if (!Number.isNaN(numericHops) && Number.isInteger(numericHops) && numericHops >= 0) {
      return {
        value: numericHops === 0 ? false : numericHops,
        source: "explicit_env",
        reason: `Explicitly set to ${numericHops} hops via TRUSTED_PROXIES`,
      };
    }

    const proxiesList = rawTrustedProxies
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);

    if (proxiesList.length === 1) {
      return {
        value: proxiesList[0],
        source: "explicit_env",
        reason: `Explicitly set to single IP/CIDR '${proxiesList[0]}' via TRUSTED_PROXIES`,
      };
    }

    if (proxiesList.length > 1) {
      return {
        value: proxiesList,
        source: "explicit_env",
        reason: `Explicitly set to list of ${proxiesList.length} IPs/CIDRs via TRUSTED_PROXIES`,
      };
    }

    return {
      value: false,
      source: "explicit_env",
      reason: "Empty or invalid TRUSTED_PROXIES string, defaulted to false",
    };
  }

  const platform = detectKnownProxyPlatform(env);
  if (platform) {
    return {
      value: 1,
      source: "known_platform",
      platformName: platform,
      reason: `Detected known cloud ingress platform (${platform}); trusted 1 reverse proxy hop`,
    };
  }

  return {
    value: false,
    source: "direct_default",
    reason: "Direct standalone deployment without known proxy or TRUSTED_PROXIES; defaulting to false to prevent header spoofing",
  };
}

/**
 * Validates the safety of the combination of host binding and trust proxy setting.
 * Emits actionable warning logs if trust proxy is active while the server is bound to all interfaces
 * without a known cloud environment managing firewalling.
 */
export function auditProxyExposure(
  trustResolution: TrustProxyResolution,
  bindHost: string,
  port: number,
  env: NodeJS.ProcessEnv = process.env
): void {
  if (trustResolution.value !== false && (bindHost === "0.0.0.0" || bindHost === "::")) {
    const platform = detectKnownProxyPlatform(env);
    if (!platform) {
      logger.warn(
        {
          trustProxy: trustResolution.value,
          bindHost,
          port,
          source: trustResolution.source,
        },
        "SECURITY NOTICE: Express trust proxy is enabled while server is bound to all network interfaces (0.0.0.0) without a recognized cloud platform. " +
        "Ensure port " + port + " is firewalled or bind to 127.0.0.1 (BIND_HOST=127.0.0.1) so only your local reverse proxy (e.g. Nginx/Caddy) can send requests, " +
        "preventing direct client connections from forging X-Forwarded-For headers."
      );
    }
  }
}
