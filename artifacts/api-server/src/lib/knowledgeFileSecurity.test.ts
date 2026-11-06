import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isKnowledgeUploadPath, isOwnedKnowledgeUpload, setSafeObjectResponseHeaders } from "./knowledgeFileSecurity";

describe("knowledge upload security", () => {
  it("only accepts UUID upload paths owned by the authenticated client", () => {
    const metadata = { uploadedByUserId: "42" };
    assert.equal(isKnowledgeUploadPath("/objects/550e8400-e29b-41d4-a716-446655440000"), true);
    assert.equal(isKnowledgeUploadPath("/objects/other-company/file.svg"), false);
    assert.equal(isOwnedKnowledgeUpload("/objects/550e8400-e29b-41d4-a716-446655440000", 42, metadata), true);
    assert.equal(isOwnedKnowledgeUpload("/objects/550e8400-e29b-41d4-a716-446655440000", 43, metadata), false);
    assert.equal(isOwnedKnowledgeUpload("/objects/other-company/file.svg", 42, metadata), false);
    assert.equal(isOwnedKnowledgeUpload("/objects/550e8400-e29b-41d4-a716-446655440000", 42, undefined), false);
  });

  it("prevents SVG and private objects from being rendered as active inline content", () => {
    const headers = new Map<string, string>();
    const response = {
      setHeader: (name: string, value: string) => headers.set(name.toLowerCase(), value),
    };

    setSafeObjectResponseHeaders(response, "image/svg+xml");
    assert.equal(headers.get("content-type"), "application/octet-stream");
    assert.equal(headers.get("content-disposition"), "attachment");
    assert.equal(headers.get("x-content-type-options"), "nosniff");
    assert.match(headers.get("content-security-policy") || "", /^sandbox;/);

    headers.clear();
    setSafeObjectResponseHeaders(response, "application/pdf", true);
    assert.equal(headers.get("content-type"), "application/octet-stream");
    assert.equal(headers.get("content-disposition"), "attachment");
  });
});
