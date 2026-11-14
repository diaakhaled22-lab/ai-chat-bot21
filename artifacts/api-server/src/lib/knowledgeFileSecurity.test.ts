import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isKnowledgeUploadPath,
  isOwnedKnowledgeUpload,
  setSafeObjectResponseHeaders,
  verifyBufferFileType,
} from "./knowledgeFileSecurity";

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

  it("verifies genuine PDF magic bytes and rejects disguised files", () => {
    const validPdf = Buffer.from("%PDF-1.4\n%some valid pdf binary content");
    assert.equal(verifyBufferFileType(validPdf, "pdf").valid, true);
    assert.equal(verifyBufferFileType(validPdf, "application/pdf").valid, true);

    const fakePdfText = Buffer.from("This is just plain text disguised as a PDF file");
    assert.equal(verifyBufferFileType(fakePdfText, "pdf").valid, false);

    const fakePdfExe = Buffer.from("MZ\x90\x00\x03\x00\x00\x00"); // Windows PE executable
    assert.equal(verifyBufferFileType(fakePdfExe, "pdf").valid, false);
  });

  it("verifies genuine raster images (PNG, JPEG, GIF, WebP) and rejects fake files", () => {
    const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    assert.equal(verifyBufferFileType(validPng, "image/png").valid, true);

    const validJpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    assert.equal(verifyBufferFileType(validJpg, "image/jpeg").valid, true);

    const validGif = Buffer.from("GIF89a\x01\x00\x01\x00");
    assert.equal(verifyBufferFileType(validGif, "image/gif").valid, true);

    const validWebp = Buffer.concat([
      Buffer.from("RIFF"),
      Buffer.from([0x24, 0x00, 0x00, 0x00]),
      Buffer.from("WEBPVP8 "),
    ]);
    assert.equal(verifyBufferFileType(validWebp, "image/webp").valid, true);

    // Reject fake image (HTML script disguised as PNG)
    const fakePng = Buffer.from("<script>alert(1)</script>");
    assert.equal(verifyBufferFileType(fakePng, "image/png").valid, false);
  });

  it("verifies genuine Excel spreadsheets and rejects disguised files", () => {
    // XLSX (OpenXML ZIP)
    const validXlsx = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
    assert.equal(verifyBufferFileType(validXlsx, "excel").valid, true);
    assert.equal(verifyBufferFileType(validXlsx, "xlsx").valid, true);

    // XLS (CFBF)
    const validXls = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    assert.equal(verifyBufferFileType(validXls, "excel").valid, true);

    const fakeExcel = Buffer.from("just random text");
    assert.equal(verifyBufferFileType(fakeExcel, "excel").valid, false);
  });

  it("verifies JSON and rejects invalid JSON or files with null bytes", () => {
    const validJson = Buffer.from(JSON.stringify({ key: "value", list: [1, 2, 3] }));
    assert.equal(verifyBufferFileType(validJson, "json").valid, true);

    const invalidJson = Buffer.from("{ bad json content ");
    assert.equal(verifyBufferFileType(invalidJson, "json").valid, false);

    const nullByteJson = Buffer.from('{"key": "val\0ue"}');
    assert.equal(verifyBufferFileType(nullByteJson, "json").valid, false);
  });

  it("verifies CSV/TXT and rejects disguised executables and active web content", () => {
    const validCsv = Buffer.from("name,role,salary\nAlice,Engineer,1000\nBob,Manager,2000");
    assert.equal(verifyBufferFileType(validCsv, "csv").valid, true);

    const validTxt = Buffer.from("This is a simple knowledge text document.");
    assert.equal(verifyBufferFileType(validTxt, "txt").valid, true);

    // Reject PE executable
    const peBinary = Buffer.from("MZ\x90\x00\x03\x00\x00\x00\x04\x00");
    assert.equal(verifyBufferFileType(peBinary, "txt").valid, false);

    // Reject ELF binary
    const elfBinary = Buffer.from("\x7fELF\x02\x01\x01\x00");
    assert.equal(verifyBufferFileType(elfBinary, "csv").valid, false);

    // Reject shell script
    const shellScript = Buffer.from("#!/bin/bash\nrm -rf /");
    assert.equal(verifyBufferFileType(shellScript, "txt").valid, false);

    // Reject PHP script
    const phpScript = Buffer.from("<?php echo 'hacked'; ?>");
    assert.equal(verifyBufferFileType(phpScript, "txt").valid, false);

    // Reject HTML disguised as CSV
    const htmlDisguised = Buffer.from("<!doctype html><html><body><script>malicious()</script></body></html>");
    assert.equal(verifyBufferFileType(htmlDisguised, "csv").valid, false);

    // Reject file with binary null bytes
    const nullByteBinary = Buffer.from([0x41, 0x42, 0x00, 0x43, 0x44]);
    assert.equal(verifyBufferFileType(nullByteBinary, "txt").valid, false);
  });
});
