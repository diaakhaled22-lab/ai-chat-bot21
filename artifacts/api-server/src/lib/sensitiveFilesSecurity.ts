import { Request, Response, NextFunction } from "express";
import path from "path";
import { logger } from "./logger";

/**
 * Patterns matching sensitive file names, extensions, or directory structures
 * that must NEVER be publicly accessible under any circumstance:
 *
 * 1. Environment files: .env, .env.local, .env.production, .env.*
 * 2. Backups & swap files: *.bak, *.backup, *.old, *.orig, *.save, *.tmp, *~, *.swp, *.swo
 * 3. Database dumps & files: *.sql, *.dump, *.dmp, *.sqlite, *.sqlite3, *.db, *.rdb, *.psql
 * 4. Version control directories: .git, .svn, .hg, .bzr, and VCS metadata files
 * 5. Configuration & manifest files: package.json, pnpm-lock.yaml, tsconfig.json,
 *    drizzle.config.*, vite.config.*, orval.config.*, Dockerfile, docker-compose.*, etc.
 * 6. Hidden dotfiles and dotfolders: /.* (e.g. /.aws, /.ssh, /.config)
 */

const BLOCKED_FILE_EXTENSIONS = new Set([
  // Database & dumps
  ".sql",
  ".dump",
  ".dmp",
  ".sqlite",
  ".sqlite3",
  ".db",
  ".rdb",
  ".psql",
  ".pgsql",

  // Backups & editor swap files
  ".bak",
  ".backup",
  ".old",
  ".orig",
  ".save",
  ".tmp",
  ".swp",
  ".swo",
  ".copy",

  // Compressed archives when probed directly
  ".tar",
  ".gz",
  ".tgz",
  ".bz2",
  ".7z",
  ".rar",

  // Key & credential files
  ".pem",
  ".key",
  ".crt",
  ".pfx",
  ".p12",
  ".id_rsa",
  ".pub",
]);

const BLOCKED_EXACT_FILENAMES = new Set([
  // Project manifests & lockfiles
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "yarn.lock",
  "bun.lockb",

  // TypeScript & build configs
  "tsconfig.json",
  "tsconfig.base.json",
  "jsconfig.json",
  "drizzle.config.ts",
  "drizzle.config.js",
  "vite.config.ts",
  "vite.config.js",
  "orval.config.ts",
  "build.mjs",

  // Container & server configs
  "dockerfile",
  "docker-compose.yml",
  "docker-compose.yaml",
  "web.config",
  "nginx.conf",
  "httpd.conf",
  ".htaccess",
  ".htpasswd",

  // Tool configs
  ".npmrc",
  ".yarnrc",
  ".nvmrc",
  ".editorconfig",
  ".prettierrc",
  ".eslintrc",
  ".eslintignore",
  ".gitignore",
  ".gitmodules",
  ".gitattributes",
]);

/**
 * Safely decodes a URI string, handling single, double, or malformed URL encoding.
 */
export function safelyDecodeUri(uri: string): string {
  if (!uri || typeof uri !== "string") return "";

  let decoded = uri;
  // Iterate up to 3 times to unwrap nested/double URL encodings (e.g. %252e%252e -> %2e%2e -> ..)
  for (let i = 0; i < 3; i++) {
    try {
      const nextDecoded = decodeURIComponent(decoded);
      if (nextDecoded === decoded) break;
      decoded = nextDecoded;
    } catch {
      // If malformed URI sequence, stop unrolling
      break;
    }
  }

  // Remove null bytes and normalize backslashes to forward slashes
  return decoded.replace(/\0/g, "").replace(/\\/g, "/");
}

/**
 * Inspects a sanitized path and determines whether it points to a sensitive resource.
 */
export function isSensitivePath(rawPath: string): boolean {
  if (!rawPath || typeof rawPath !== "string") return false;

  const normalizedRaw = safelyDecodeUri(rawPath);
  // Normalize posix path to eliminate redundant slashes and traversal sequences
  const cleanPath = path.posix.normalize(normalizedRaw.split("?")[0].split("#")[0]);
  const lowerPath = cleanPath.toLowerCase();

  // 1. Any path containing path traversal attempts (/../ or /..\)
  if (normalizedRaw.includes("/../") || normalizedRaw.endsWith("/..") || normalizedRaw.includes("/..\\")) {
    return true;
  }

  const segments = lowerPath.split("/").filter(Boolean);

  // 2. Check each path segment for hidden dotfiles/folders or sensitive directories
  for (const segment of segments) {
    // Hidden dotfiles or dotdirectories (e.g. .git, .env, .aws, .ssh, .config)
    if (segment.startsWith(".")) {
      return true;
    }

    // Exact sensitive filenames (e.g. package.json, pnpm-lock.yaml)
    if (BLOCKED_EXACT_FILENAMES.has(segment)) {
      return true;
    }

    // Common backup and dump names
    if (
      segment.endsWith("~") ||
      segment.endsWith(".swp") ||
      segment.includes("backup") ||
      segment.includes("dump") ||
      segment.startsWith("db_")
    ) {
      const ext = path.posix.extname(segment);
      if (BLOCKED_FILE_EXTENSIONS.has(ext) || segment.endsWith("~") || ext === ".zip") {
        return true;
      }
    }
  }

  // 3. Check filename and extension of the target file
  const baseName = path.posix.basename(lowerPath);
  const extName = path.posix.extname(lowerPath);

  // Any blocked extension (.sql, .dump, .bak, .backup, .sqlite, .db, etc.)
  if (BLOCKED_FILE_EXTENSIONS.has(extName)) {
    return true;
  }

  // Archives explicitly naming backups, database, or dumps (e.g. backup.zip, dump.zip, db_export.zip)
  if (
    /(?:^|[._\-])(?:backup|dump|database|db|export|snapshot)(?:$|[._\-])/i.test(baseName) &&
    [".zip", ".tar", ".gz", ".tgz", ".7z", ".rar", ".bz2"].includes(extName)
  ) {
    return true;
  }

  // Any blocked exact filename
  if (BLOCKED_EXACT_FILENAMES.has(baseName)) {
    return true;
  }

  // Editor temp/backup files ending with ~ (e.g. index.ts~ or file.txt~)
  if (baseName.endsWith("~")) {
    return true;
  }

  // Environment file variants (e.g. .env.local, .env.staging, env.backup, etc.)
  if (
    baseName === ".env" ||
    baseName.startsWith(".env.") ||
    baseName.startsWith(".env-") ||
    baseName.endsWith(".env")
  ) {
    return true;
  }

  return false;
}

/**
 * Middleware that strictly intercepts and blocks public HTTP requests
 * targeting sensitive files, backups, SQL dumps, VCS directories, and config files.
 *
 * Responds with HTTP 404 Not Found to prevent leaking the existence or structure
 * of internal files to scanners or attackers.
 */
export function sensitiveFilesGuard(req: Request, res: Response, next: NextFunction): void {
  const candidatePaths = [
    req.path,
    req.url,
    req.originalUrl,
    req.baseUrl ? `${req.baseUrl}${req.path}` : null,
  ].filter(Boolean) as string[];

  for (const candidate of candidatePaths) {
    if (isSensitivePath(candidate)) {
      const rawIp = req.ip || req.socket.remoteAddress || "unknown";
      const ip = rawIp.replace(/^::ffff:/i, "").trim() || "unknown";

      logger.warn(
        {
          ip,
          method: req.method,
          requestedPath: req.originalUrl || req.url,
          matchedTarget: candidate,
        },
        "SECURITY: Blocked public request to sensitive file/directory"
      );

      // Return 404 Not Found to avoid confirming resource existence
      res.status(404).json({ error: "Not Found" });
      return;
    }
  }

  next();
}
