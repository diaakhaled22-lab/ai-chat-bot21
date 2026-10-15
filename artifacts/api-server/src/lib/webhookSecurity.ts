import crypto from "crypto";
import { Request, Response, NextFunction } from "express";
import { db, adminConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

declare global {
  namespace Express {
    interface Request {
      rawBody?: Buffer;
    }
  }
}

let cachedMetaAppSecret: { value: string | null; expiry: number } = { value: null, expiry: 0 };

/**
 * Invalidate cached Meta App Secret (e.g. after update from Admin UI)
 */
export function clearMetaAppSecretCache(): void {
  cachedMetaAppSecret = { value: null, expiry: 0 };
}

/**
 * Retrieve the active Meta App Secret from the admin configuration or environment variables.
 */
export async function getMetaAppSecret(): Promise<string | null> {
  const now = Date.now();
  if (cachedMetaAppSecret.expiry > now) {
    return cachedMetaAppSecret.value;
  }

  try {
    const [row] = await db
      .select()
      .from(adminConfigTable)
      .where(eq(adminConfigTable.key, "meta_app_secret"))
      .limit(1);

    const val =
      row?.value?.trim() ||
      process.env.META_APP_SECRET?.trim() ||
      process.env.WHATSAPP_APP_SECRET?.trim() ||
      process.env.MESSENGER_APP_SECRET?.trim() ||
      null;

    cachedMetaAppSecret = { value: val, expiry: now + 30_000 };
    return val;
  } catch (err) {
    logger.error({ err }, "Failed to query meta_app_secret from db");
    return process.env.META_APP_SECRET?.trim() || null;
  }
}

/**
 * Verify HMAC-SHA256 (or HMAC-SHA1) signature sent by Meta in X-Hub-Signature-256 header.
 * Uses crypto.timingSafeEqual to prevent side-channel timing attacks.
 */
export function verifyMetaSignature(
  rawBody: Buffer | string | undefined,
  signatureHeader: string | undefined,
  appSecret: string
): boolean {
  if (!signatureHeader || !appSecret) return false;

  const parts = signatureHeader.trim().split("=");
  if (parts.length !== 2) return false;

  const [algo, receivedHex] = parts;
  if (algo !== "sha256" && algo !== "sha1") return false;

  let bodyBuffer: Buffer;
  if (Buffer.isBuffer(rawBody)) {
    bodyBuffer = rawBody;
  } else if (typeof rawBody === "string") {
    bodyBuffer = Buffer.from(rawBody, "utf8");
  } else {
    bodyBuffer = Buffer.from("");
  }

  try {
    const expectedHex = crypto
      .createHmac(algo, appSecret)
      .update(bodyBuffer)
      .digest("hex");

    const receivedBuf = Buffer.from(receivedHex, "hex");
    const expectedBuf = Buffer.from(expectedHex, "hex");

    if (receivedBuf.length === 0 || receivedBuf.length !== expectedBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(receivedBuf, expectedBuf);
  } catch (err) {
    logger.warn({ err }, "Error calculating or verifying Meta webhook HMAC signature");
    return false;
  }
}

/**
 * Compares two strings using constant-time comparison to prevent timing side-channel attacks.
 */
export function timingSafeCompare(a: string | undefined | null, b: string | undefined | null): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Express middleware to cryptographically verify incoming Meta (WhatsApp / Messenger) webhooks.
 * If Meta App Secret is configured:
 *  - Rejects with 401 Unauthorized if X-Hub-Signature-256 is absent or mathematically invalid.
 * If not yet configured:
 *  - Logs a security notice and passes through so initial webhook setup is never blocked.
 */
export function createMetaSignatureMiddleware(options?: { channelName?: string }) {
  const channel = options?.channelName || "Meta";

  return async (req: Request, res: Response, next: NextFunction) => {
    // Only verify POST requests
    if (req.method !== "POST") {
      return next();
    }

    const appSecret = await getMetaAppSecret();

    if (!appSecret) {
      // If secret not configured in Admin panel, allow traffic with a warning
      // so webhook functionality is not disrupted during setup.
      logger.warn(
        { channel, path: req.originalUrl || req.path },
        `[Webhook Security] ${channel} App Secret (meta_app_secret) is not configured. Signature verification bypassed. Configure it in Admin -> Webhooks for 100% cryptographic certainty.`
      );
      return next();
    }

    const sigHeader =
      (req.headers["x-hub-signature-256"] as string | undefined) ||
      (req.headers["x-hub-signature"] as string | undefined);

    if (!sigHeader) {
      logger.warn(
        { channel, ip: req.ip, path: req.originalUrl },
        `[Webhook Security] Rejected ${channel} webhook: missing X-Hub-Signature-256 header.`
      );
      res.status(401).json({
        error: "Unauthorized: Missing X-Hub-Signature-256 cryptographic signature header",
      });
      return;
    }

    const isValid = verifyMetaSignature(req.rawBody, sigHeader, appSecret);

    if (!isValid) {
      logger.warn(
        { channel, ip: req.ip, path: req.originalUrl },
        `[Webhook Security] CRITICAL: Invalid ${channel} cryptographic signature (HMAC mismatch). Request rejected.`
      );
      res.status(401).json({
        error: "Unauthorized: Invalid cryptographic signature",
      });
      return;
    }

    next();
  };
}

export const verifyMetaWebhookSignature = createMetaSignatureMiddleware();
