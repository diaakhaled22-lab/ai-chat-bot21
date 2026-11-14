const KNOWLEDGE_UPLOAD_PATH = /^\/objects\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isKnowledgeUploadPath(objectPath: string): boolean {
  return KNOWLEDGE_UPLOAD_PATH.test(objectPath);
}

export function isOwnedKnowledgeUpload(
  objectPath: string,
  userId: number,
  customMetadata: Record<string, unknown> | undefined,
): boolean {
  return (
    isKnowledgeUploadPath(objectPath) &&
    customMetadata?.uploadedByUserId === String(userId)
  );
}

export function setSafeObjectResponseHeaders(
  res: { setHeader: (name: string, value: string) => unknown },
  contentType: string | undefined,
  forceDownload = false,
): void {
  const isSvg = contentType?.split(";")[0].trim().toLowerCase() === "image/svg+xml";
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'; script-src 'none'; object-src 'none'");

  if (forceDownload || isSvg) {
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", "attachment");
  }
}

export interface FileTypeVerificationResult {
  valid: boolean;
  error?: string;
  detectedType?: string;
}

/**
 * Inspects the actual binary content (magic bytes and structure) of a buffer
 * to verify that it matches the expected file type, rejecting disguised executables or scripts.
 */
export function verifyBufferFileType(
  buffer: Buffer,
  expectedTypeOrMime: string,
  fileName?: string,
): FileTypeVerificationResult {
  if (!buffer || buffer.length === 0) {
    return { valid: false, error: "File buffer is empty" };
  }

  // 1. Universal Disguised Executable Check
  // Reject Windows PE executables (MZ)
  if (buffer.length >= 2 && buffer[0] === 0x4d && buffer[1] === 0x5a) {
    return { valid: false, error: "Executable binary files (Windows PE/MZ) are not permitted." };
  }
  // Reject Linux/Unix ELF binaries (\x7fELF)
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x7f &&
    buffer[1] === 0x45 &&
    buffer[2] === 0x4c &&
    buffer[3] === 0x46
  ) {
    return { valid: false, error: "Executable binary files (Linux ELF) are not permitted." };
  }
  // Reject Mach-O binaries / Java bytecode (0xCAFEBABE, 0xFEEDFACE, etc.)
  if (buffer.length >= 4) {
    const magic = buffer.readUInt32BE(0);
    if (magic === 0xcafebabe || magic === 0xfeedface || magic === 0xfeedfacf || magic === 0xcefaedfe) {
      return { valid: false, error: "Executable or compiled binary files are not permitted." };
    }
  }

  const normalized = expectedTypeOrMime.toLowerCase().trim();

  // 2. PDF verification
  if (normalized === "pdf" || normalized === "application/pdf") {
    // PDF must contain '%PDF-' within the first 1024 bytes
    const headerLimit = Math.min(buffer.length, 1024);
    const header = buffer.subarray(0, headerLimit);
    if (!header.includes(Buffer.from("%PDF-"))) {
      return {
        valid: false,
        error: "File content does not match genuine PDF magic bytes signature (%PDF-).",
      };
    }
    return { valid: true, detectedType: "pdf" };
  }

  // 3. PNG verification
  if (normalized === "png" || normalized === "image/png") {
    // 89 50 4E 47 0D 0A 1A 0A
    if (
      buffer.length < 8 ||
      buffer[0] !== 0x89 ||
      buffer[1] !== 0x50 ||
      buffer[2] !== 0x4e ||
      buffer[3] !== 0x47 ||
      buffer[4] !== 0x0d ||
      buffer[5] !== 0x0a ||
      buffer[6] !== 0x1a ||
      buffer[7] !== 0x0a
    ) {
      return { valid: false, error: "File content does not match genuine PNG signature." };
    }
    return { valid: true, detectedType: "png" };
  }

  // 4. JPEG verification
  if (
    normalized === "jpeg" ||
    normalized === "jpg" ||
    normalized === "image/jpeg" ||
    normalized === "image/jpg"
  ) {
    // FF D8 FF
    if (buffer.length < 3 || buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff) {
      return { valid: false, error: "File content does not match genuine JPEG signature." };
    }
    return { valid: true, detectedType: "jpeg" };
  }

  // 5. GIF verification
  if (normalized === "gif" || normalized === "image/gif") {
    // GIF87a or GIF89a
    if (
      buffer.length < 6 ||
      buffer[0] !== 0x47 ||
      buffer[1] !== 0x49 ||
      buffer[2] !== 0x46 ||
      buffer[3] !== 0x38 ||
      (buffer[4] !== 0x37 && buffer[4] !== 0x39) ||
      buffer[5] !== 0x61
    ) {
      return { valid: false, error: "File content does not match genuine GIF signature." };
    }
    return { valid: true, detectedType: "gif" };
  }

  // 6. WEBP verification
  if (normalized === "webp" || normalized === "image/webp") {
    // RIFF....WEBP
    if (
      buffer.length < 12 ||
      buffer.subarray(0, 4).toString("ascii") !== "RIFF" ||
      buffer.subarray(8, 12).toString("ascii") !== "WEBP"
    ) {
      return { valid: false, error: "File content does not match genuine WebP signature." };
    }
    return { valid: true, detectedType: "webp" };
  }

  // 7. Excel verification (.xlsx / .xls)
  if (
    normalized === "excel" ||
    normalized === "xlsx" ||
    normalized === "xls" ||
    normalized === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    normalized === "application/vnd.ms-excel"
  ) {
    // Modern XLSX is a ZIP container: PK\x03\x04 or PK\x05\x06 or PK\x07\x08
    const isZip =
      buffer.length >= 4 &&
      buffer[0] === 0x50 &&
      buffer[1] === 0x4b &&
      ((buffer[2] === 0x03 && buffer[3] === 0x04) ||
        (buffer[2] === 0x05 && buffer[3] === 0x06) ||
        (buffer[2] === 0x07 && buffer[3] === 0x08));

    // Legacy XLS is CFBF: D0 CF 11 E0 A1 B1 1A E1
    const isCfbf =
      buffer.length >= 8 &&
      buffer[0] === 0xd0 &&
      buffer[1] === 0xcf &&
      buffer[2] === 0x11 &&
      buffer[3] === 0xe0 &&
      buffer[4] === 0xa1 &&
      buffer[5] === 0xb1 &&
      buffer[6] === 0x1a &&
      buffer[7] === 0xe1;

    if (!isZip && !isCfbf) {
      return {
        valid: false,
        error: "File content does not match genuine Excel spreadsheet signature (OpenXML ZIP or CFBF).",
      };
    }
    return { valid: true, detectedType: isZip ? "xlsx" : "xls" };
  }

  // 8. JSON verification
  if (normalized === "json" || normalized === "application/json") {
    // Ensure no null bytes
    if (buffer.includes(0x00)) {
      return { valid: false, error: "JSON files must not contain null bytes." };
    }
    const text = buffer.toString("utf-8").trim();
    if (!text.startsWith("{") && !text.startsWith("[")) {
      return { valid: false, error: "JSON content must start with '{' or '['." };
    }
    try {
      JSON.parse(text);
      return { valid: true, detectedType: "json" };
    } catch {
      return { valid: false, error: "File content is not valid JSON." };
    }
  }

  // 9. CSV and Plain Text verification
  if (
    normalized === "csv" ||
    normalized === "text/csv" ||
    normalized === "txt" ||
    normalized === "text/plain"
  ) {
    // Pure text and CSV must not contain binary null bytes
    if (buffer.includes(0x00)) {
      return { valid: false, error: "Text/CSV files must not contain binary null bytes." };
    }

    const preview = buffer.subarray(0, Math.min(buffer.length, 1024)).toString("utf-8").toLowerCase().trim();

    // Reject shell script shebangs
    if (preview.startsWith("#!/")) {
      return { valid: false, error: "Executable shell scripts are not permitted." };
    }

    // Reject PHP scripts
    if (preview.includes("<?php") || preview.startsWith("<?=")) {
      return { valid: false, error: "PHP script files are not permitted." };
    }

    // Reject HTML/SVG active web content disguised as text/csv
    if (
      preview.startsWith("<!doctype html") ||
      preview.startsWith("<html") ||
      preview.includes("<script") ||
      preview.startsWith("<svg")
    ) {
      return { valid: false, error: "HTML/SVG documents are not permitted as text/CSV files." };
    }

    return { valid: true, detectedType: normalized.includes("csv") ? "csv" : "txt" };
  }

  return { valid: false, error: `Unsupported file type: ${expectedTypeOrMime}` };
}
