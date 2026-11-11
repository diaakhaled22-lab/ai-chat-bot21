import assert from "node:assert/strict";
import crypto from "node:crypto";
import { describe, it } from "node:test";
import { createMetaSignatureMiddleware } from "./webhookSecurity";

const requestBody = Buffer.from('{"object":"whatsapp_business_account"}');
const appSecret = "test-meta-app-secret";
const signature = `sha256=${crypto.createHmac("sha256", appSecret).update(requestBody).digest("hex")}`;

async function invokeMiddleware(options: {
  getAppSecret: () => Promise<string | null>;
  rawBody?: Buffer;
  signature?: string;
}) {
  const req = {
    method: "POST",
    rawBody: options.rawBody,
    headers: options.signature ? { "x-hub-signature-256": options.signature } : {},
    ip: "127.0.0.1",
    originalUrl: "/api/whatsapp/webhook",
    path: "/whatsapp/webhook",
  } as any;
  const response: { statusCode?: number; body?: unknown } = {};
  const res = {
    status(code: number) {
      response.statusCode = code;
      return this;
    },
    json(body: unknown) {
      response.body = body;
      return this;
    },
  } as any;
  let nextCalled = false;
  await createMetaSignatureMiddleware({ getAppSecret: options.getAppSecret })(req, res, () => {
    nextCalled = true;
  });
  return { ...response, nextCalled };
}

describe("Meta webhook signature middleware", () => {
  it("fails closed when the app secret is missing or cannot be loaded", async () => {
    const missing = await invokeMiddleware({ getAppSecret: async () => null, rawBody: requestBody, signature });
    assert.equal(missing.statusCode, 503);
    assert.equal(missing.nextCalled, false);

    const unavailable = await invokeMiddleware({
      getAppSecret: async () => {
        throw new Error("database unavailable");
      },
      rawBody: requestBody,
      signature,
    });
    assert.equal(unavailable.statusCode, 503);
    assert.equal(unavailable.nextCalled, false);
  });

  it("rejects requests without raw bytes or with an invalid signature", async () => {
    const missingBody = await invokeMiddleware({ getAppSecret: async () => appSecret, signature });
    assert.equal(missingBody.statusCode, 400);
    assert.equal(missingBody.nextCalled, false);

    const invalidSignature = await invokeMiddleware({
      getAppSecret: async () => appSecret,
      rawBody: requestBody,
      signature: "sha256=00",
    });
    assert.equal(invalidSignature.statusCode, 401);
    assert.equal(invalidSignature.nextCalled, false);
  });

  it("continues only when the signature matches the captured request bytes", async () => {
    const result = await invokeMiddleware({
      getAppSecret: async () => appSecret,
      rawBody: requestBody,
      signature,
    });
    assert.equal(result.nextCalled, true);
    assert.equal(result.statusCode, undefined);
  });

  it("strictly rejects deprecated sha1 algorithm in signature", async () => {
    const sha1Sig = `sha1=${crypto.createHmac("sha1", appSecret).update(requestBody).digest("hex")}`;
    const result = await invokeMiddleware({
      getAppSecret: async () => appSecret,
      rawBody: requestBody,
      signature: sha1Sig,
    });
    assert.equal(result.statusCode, 401);
    assert.equal(result.nextCalled, false);
  });
});
