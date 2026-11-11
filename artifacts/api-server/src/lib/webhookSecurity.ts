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
    return (
      process.env.META_APP_SECRET?.trim() ||
      process.env.WHATSAPP_APP_SECRET?.trim() ||
      process.env.MESSENGER_APP_SECRET?.trim() ||
      null
    );
  }
}

/**
 * Verify HMAC-SHA256 signature sent by Meta in X-Hub-Signature-256 header.
 * Strictly restricted to sha256 (rejects deprecated/weak sha1) to prevent collision and downgrade attacks.
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
  // Strictly enforce sha256 only — reject deprecated and insecure sha1
  if (algo.toLowerCase() !== "sha256") return false;

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
      .createHmac("sha256", appSecret)
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
 * Missing configuration or raw request bytes fail closed.
 */
export function createMetaSignatureMiddleware(options?: {
  channelName?: string;
  getAppSecret?: () => Promise<string | null>;
}) {
  const channel = options?.channelName || "Meta";
  const loadSecret = options?.getAppSecret || getMetaAppSecret;

  return async (req: Request, res: Response, next: NextFunction) => {
    // Only verify POST requests
    if (req.method !== "POST") {
      return next();
    }

    let appSecret: string | null;
    try {
      appSecret = await loadSecret();
    } catch (err) {
      logger.error({ err, channel }, "Failed to load Meta App Secret; rejecting webhook");
      res.status(503).json({ error: "Meta webhook signature verification is unavailable" });
      return;
    }

    if (!appSecret) {
      logger.error(
        { channel, path: req.originalUrl || req.path },
        `[Webhook Security] ${channel} App Secret is not configured; rejecting webhook`,
      );
      res.status(503).json({ error: "Meta webhook signature verification is not configured" });
      return;
    }

    if (!req.rawBody) {
      logger.error(
        { channel, path: req.originalUrl || req.path },
        `[Webhook Security] Raw request body unavailable; rejecting webhook`,
      );
      res.status(400).json({ error: "Raw request body is required for signature verification" });
      return;
    }

    // Strictly require X-Hub-Signature-256 header; reject deprecated X-Hub-Signature (sha1)
    const sigHeader = req.headers["x-hub-signature-256"] as string | undefined;

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
