import crypto from "crypto";
import { db, adminConfigTable, decryptAdminConfigValue } from "@workspace/db";
import { logger } from "./logger";

export interface CaptchaVerificationResult {
  valid: boolean;
  provider?: "turnstile" | "hcaptcha" | "recaptcha" | "test";
  reason?: string;
  errorCodes?: string[];
}

let cachedSecrets: {
  turnstile: string | null;
  hcaptcha: string | null;
  recaptcha: string | null;
  expiry: number;
} = { turnstile: null, hcaptcha: null, recaptcha: null, expiry: 0 };

export function clearCaptchaSecretCache(): void {
  cachedSecrets = { turnstile: null, hcaptcha: null, recaptcha: null, expiry: 0 };
}

/**
 * Retrieves the configured CAPTCHA secret keys, prioritizing environment variables
 * and falling back to adminConfigTable.
 */
export async function getCaptchaSecrets(): Promise<{
  turnstileSecret: string | null;
  hcaptchaSecret: string | null;
  recaptchaSecret: string | null;
}> {
  const now = Date.now();
  if (cachedSecrets.expiry > now) {
    return {
      turnstileSecret: cachedSecrets.turnstile,
      hcaptchaSecret: cachedSecrets.hcaptcha,
      recaptchaSecret: cachedSecrets.recaptcha,
    };
  }

  let turnstileSecret =
    process.env.TURNSTILE_SECRET_KEY?.trim() ||
    process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY?.trim() ||
    null;
  let hcaptchaSecret = process.env.HCAPTCHA_SECRET_KEY?.trim() || null;
  let recaptchaSecret = process.env.RECAPTCHA_SECRET_KEY?.trim() || null;

  try {
    const rows = await db
      .select({ key: adminConfigTable.key, value: adminConfigTable.value })
      .from(adminConfigTable);

    for (const r of rows) {
      if (r.key === "turnstile_secret_key" && r.value?.trim()) {
        const val = decryptAdminConfigValue("turnstile_secret_key", r.value).trim();
        if (val) turnstileSecret = val;
      }
      if (r.key === "hcaptcha_secret_key" && r.value?.trim()) {
        const val = decryptAdminConfigValue("hcaptcha_secret_key", r.value).trim();
        if (val) hcaptchaSecret = val;
      }
      if (r.key === "recaptcha_secret_key" && r.value?.trim()) {
        const val = decryptAdminConfigValue("recaptcha_secret_key", r.value).trim();
        if (val) recaptchaSecret = val;
      }
    }
  } catch (err) {
    logger.warn({ err }, "Could not query captcha secrets from adminConfigTable");
  }

  cachedSecrets = {
    turnstile: turnstileSecret,
    hcaptcha: hcaptchaSecret,
    recaptcha: recaptchaSecret,
    expiry: now + 60_000,
  };

  return { turnstileSecret, hcaptchaSecret, recaptchaSecret };
}

/**
 * Extracts a CAPTCHA response token from the incoming request body or headers.
 * Supports Cloudflare Turnstile, hCaptcha, and standard form/JSON keys.
 */
export function extractCaptchaToken(req: { body?: unknown; headers?: Record<string, string | string[] | undefined> }): string | undefined {
  const body = req.body as Record<string, unknown> | undefined;
  if (body && typeof body === "object") {
    if (typeof body.turnstileToken === "string" && body.turnstileToken.trim()) return body.turnstileToken.trim();
    if (typeof body.captchaToken === "string" && body.captchaToken.trim()) return body.captchaToken.trim();
    if (typeof body.hcaptchaToken === "string" && body.hcaptchaToken.trim()) return body.hcaptchaToken.trim();
    if (typeof body.captcha === "string" && body.captcha.trim()) return body.captcha.trim();
    if (typeof body["cf-turnstile-response"] === "string" && body["cf-turnstile-response"].trim()) return body["cf-turnstile-response"].trim();
    if (typeof body["h-captcha-response"] === "string" && body["h-captcha-response"].trim()) return body["h-captcha-response"].trim();
  }

  if (req.headers) {
    const cfHeader = req.headers["cf-turnstile-response"];
    if (typeof cfHeader === "string" && cfHeader.trim()) return cfHeader.trim();
    const capHeader = req.headers["x-captcha-token"];
    if (typeof capHeader === "string" && capHeader.trim()) return capHeader.trim();
  }

  return undefined;
}

/**
 * Validates a CAPTCHA token against Cloudflare Turnstile, hCaptcha, or Google reCAPTCHA.
 * In automated test suites or local dev, supports official dummy pass/fail tokens.
 */
export async function verifyCaptchaToken(
  token: string | undefined | null,
  clientIp?: string
): Promise<CaptchaVerificationResult> {
  if (!token || typeof token !== "string" || !token.trim()) {
    return { valid: false, reason: "missing_token" };
  }

  const cleanToken = token.trim();

  // 1. In non-production environments only: allow mock/dummy tokens for automated test suites
  if (process.env.NODE_ENV !== "production") {
    if (
      cleanToken === "1x0000000000000000000000000000000AA" ||
      cleanToken === "test-turnstile-pass" ||
      cleanToken === "test-captcha-valid" ||
      cleanToken === "XXXX.DUMMY.TOKEN.XXXX"
    ) {
      return { valid: true, provider: "test" };
    }

    if (
      cleanToken === "2x0000000000000000000000000000000AA" ||
      cleanToken === "test-turnstile-fail" ||
      cleanToken === "test-invalid-captcha"
    ) {
      return { valid: false, provider: "test", reason: "invalid_test_token" };
    }
  }

  const { turnstileSecret, hcaptchaSecret, recaptchaSecret } = await getCaptchaSecrets();

  // 2. Cloudflare Turnstile verification
  if (turnstileSecret) {
    try {
      const form = new URLSearchParams();
      form.append("secret", turnstileSecret);
      form.append("response", cleanToken);
      if (clientIp && clientIp !== "unknown") {
        form.append("remoteip", clientIp);
      }

      const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
        signal: AbortSignal.timeout(6000),
      });

      if (!res.ok) {
        logger.error({ status: res.status }, "Turnstile siteverify returned HTTP error");
        return { valid: false, provider: "turnstile", reason: `http_${res.status}` };
      }

      const data = (await res.json()) as { success: boolean; "error-codes"?: string[] };
      if (data.success) {
        return { valid: true, provider: "turnstile" };
      }
      return {
        valid: false,
        provider: "turnstile",
        reason: data["error-codes"]?.join(", ") || "verification_failed",
        errorCodes: data["error-codes"],
      };
    } catch (err: any) {
      logger.error({ err }, "Turnstile network verification exception");
      return { valid: false, provider: "turnstile", reason: err.message || "network_error" };
    }
  }

  // 3. hCaptcha verification
  if (hcaptchaSecret) {
    try {
      const form = new URLSearchParams();
      form.append("secret", hcaptchaSecret);
      form.append("response", cleanToken);
      if (clientIp && clientIp !== "unknown") {
        form.append("remoteip", clientIp);
      }

      const res = await fetch("https://api.hcaptcha.com/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
        signal: AbortSignal.timeout(6000),
      });

      const data = (await res.json()) as { success: boolean; "error-codes"?: string[] };
      if (data.success) {
        return { valid: true, provider: "hcaptcha" };
      }
      return {
        valid: false,
        provider: "hcaptcha",
        reason: data["error-codes"]?.join(", ") || "verification_failed",
        errorCodes: data["error-codes"],
      };
    } catch (err: any) {
      logger.error({ err }, "hCaptcha network verification exception");
      return { valid: false, provider: "hcaptcha", reason: err.message || "network_error" };
    }
  }

  // 4. Google reCAPTCHA verification
  if (recaptchaSecret) {
    try {
      const form = new URLSearchParams();
      form.append("secret", recaptchaSecret);
      form.append("response", cleanToken);
      if (clientIp && clientIp !== "unknown") {
        form.append("remoteip", clientIp);
      }

      const res = await fetch("https://www.google.com/recaptcha/api/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
        signal: AbortSignal.timeout(6000),
      });

      const data = (await res.json()) as { success: boolean; "error-codes"?: string[] };
      if (data.success) {
        return { valid: true, provider: "recaptcha" };
      }
      return {
        valid: false,
        provider: "recaptcha",
        reason: data["error-codes"]?.join(", ") || "verification_failed",
        errorCodes: data["error-codes"],
      };
    } catch (err: any) {
      logger.error({ err }, "reCAPTCHA network verification exception");
      return { valid: false, provider: "recaptcha", reason: err.message || "network_error" };
    }
  }

  // 5. In development or test environment without an external provider configured
  if (process.env.NODE_ENV !== "production") {
    logger.warn("No CAPTCHA secret key configured. In non-production mode, accepting token.");
    return { valid: cleanToken.length >= 8, provider: "test" };
  }

  // In production with NO provider configured, fail closed
  logger.error("Security alert: CAPTCHA required by policy but no provider secret (TURNSTILE_SECRET_KEY / HCAPTCHA_SECRET_KEY) is configured.");
  return { valid: false, reason: "captcha_unconfigured_in_production" };
}

// ── Built-in HMAC-signed CAPTCHA challenge (fallback when no external CAPTCHA key is set) ──
const BUILTIN_CAPTCHA_TTL_MS = 5 * 60 * 1000;
const usedBuiltinNonces = new Map<string, number>();
let ephemeralChallengeSecret: string | null = null;

function getBuiltinChallengeSecret(): string {
  const secret = process.env.SESSION_SECRET?.trim() || process.env.ENCRYPTION_KEY?.trim();
  if (secret) return secret;
  if (!ephemeralChallengeSecret) {
    ephemeralChallengeSecret = crypto.randomBytes(32).toString("hex");
  }
  return ephemeralChallengeSecret;
}

function cleanupExpiredBuiltinNonces(): void {
  const now = Date.now();
  for (const [nonce, exp] of usedBuiltinNonces) {
    if (exp <= now) usedBuiltinNonces.delete(nonce);
  }
}

export function createBuiltinCaptchaChallenge(): { challengeToken: string; question: string; expiresInSeconds: number } {
  cleanupExpiredBuiltinNonces();
  const a = crypto.randomInt(2, 16);
  const b = crypto.randomInt(2, 16);
  const nonce = crypto.randomBytes(12).toString("hex");
  const exp = Date.now() + BUILTIN_CAPTCHA_TTL_MS;
  const answerHash = crypto.createHash("sha256").update(`${nonce}:${a + b}`).digest("hex");

  const payload = Buffer.from(JSON.stringify({ nonce, exp, answerHash }), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", getBuiltinChallengeSecret()).update(payload).digest("base64url");

  return {
    challengeToken: `${payload}.${sig}`,
    question: `${a} + ${b} = ?`,
    expiresInSeconds: Math.floor(BUILTIN_CAPTCHA_TTL_MS / 1000),
  };
}

export function verifyBuiltinCaptchaChallenge(
  challengeToken: unknown,
  answer: unknown
): { valid: boolean; reason?: string } {
  cleanupExpiredBuiltinNonces();
  if (typeof challengeToken !== "string" || !challengeToken.includes(".")) {
    return { valid: false, reason: "missing_builtin_challenge" };
  }
  const cleanAnswer = typeof answer === "number" ? String(answer) : typeof answer === "string" ? answer.trim() : "";
  if (!/^\d{1,4}$/.test(cleanAnswer)) {
    return { valid: false, reason: "invalid_builtin_answer_format" };
  }

  const [payload, sig] = challengeToken.split(".", 2);
  if (!payload || !sig) {
    return { valid: false, reason: "malformed_builtin_challenge" };
  }

  const expectedSig = crypto.createHmac("sha256", getBuiltinChallengeSecret()).update(payload).digest("base64url");
  try {
    const aBuf = Buffer.from(sig, "utf8");
    const bBuf = Buffer.from(expectedSig, "utf8");
    if (aBuf.length !== bBuf.length || !crypto.timingSafeEqual(aBuf, bBuf)) {
      return { valid: false, reason: "invalid_builtin_signature" };
    }
  } catch {
    return { valid: false, reason: "signature_error" };
  }

  let parsed: { nonce?: string; exp?: number; answerHash?: string };
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return { valid: false, reason: "invalid_builtin_payload" };
  }

  if (!parsed.nonce || typeof parsed.exp !== "number" || !parsed.answerHash) {
    return { valid: false, reason: "incomplete_builtin_payload" };
  }
  if (Date.now() > parsed.exp) {
    return { valid: false, reason: "expired_builtin_challenge" };
  }
  if (usedBuiltinNonces.has(parsed.nonce)) {
    return { valid: false, reason: "replayed_builtin_challenge" };
  }

  // Consume nonce regardless of guess to prevent brute-forcing one challenge
  usedBuiltinNonces.set(parsed.nonce, parsed.exp);

  const providedHash = crypto.createHash("sha256").update(`${parsed.nonce}:${Number(cleanAnswer)}`).digest("hex");
  try {
    const pBuf = Buffer.from(providedHash, "utf8");
    const eBuf = Buffer.from(parsed.answerHash, "utf8");
    if (pBuf.length !== eBuf.length || !crypto.timingSafeEqual(pBuf, eBuf)) {
      return { valid: false, reason: "wrong_builtin_answer" };
    }
  } catch {
    return { valid: false, reason: "hash_compare_error" };
  }

  return { valid: true };
}
