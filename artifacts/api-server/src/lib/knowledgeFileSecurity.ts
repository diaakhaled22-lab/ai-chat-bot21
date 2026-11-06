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
