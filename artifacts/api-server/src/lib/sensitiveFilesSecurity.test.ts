import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isSensitivePath, safelyDecodeUri, sensitiveFilesGuard } from "./sensitiveFilesSecurity";

describe("Sensitive Files Public Reachability Defense", () => {
  describe("safelyDecodeUri", () => {
    it("decodes standard and multi-layer URL encoding properly", () => {
      assert.equal(safelyDecodeUri("%2e%2e%2f%2eenv"), "../.env");
      assert.equal(safelyDecodeUri("%252e%252e%252fbackup.sql"), "../backup.sql");
      assert.equal(safelyDecodeUri("normal/path/file.txt"), "normal/path/file.txt");
    });

    it("strips null bytes and normalizes backslashes", () => {
      assert.equal(safelyDecodeUri("path\\to\\..\\file\0.sql"), "path/to/../file.sql");
    });
  });

  describe("isSensitivePath - .env detection", () => {
    it("blocks .env and all its variations", () => {
      const envPaths = [
        "/.env",
        "/.env.local",
        "/.env.production",
        "/.env.development",
        "/.env.staging",
        "/.env.test",
        "/api/.env",
        "/config/.env",
        "/app/.env.production",
        "/sub/dir/.env",
        "/production.env",
        "/.env-example",
      ];

      for (const p of envPaths) {
        assert.equal(isSensitivePath(p), true, `Failed to block: ${p}`);
      }
    });
  });

  describe("isSensitivePath - .git and VCS detection", () => {
    it("blocks .git directory and VCS metadata", () => {
      const gitPaths = [
        "/.git",
        "/.git/",
        "/.git/config",
        "/.git/HEAD",
        "/.git/index",
        "/.git/logs/HEAD",
        "/api/.git",
        "/.gitignore",
        "/.gitmodules",
        "/.gitattributes",
        "/.svn/entries",
        "/.hg/dirstate",
      ];

      for (const p of gitPaths) {
        assert.equal(isSensitivePath(p), true, `Failed to block: ${p}`);
      }
    });
  });

  describe("isSensitivePath - SQL dumps and database files", () => {
    it("blocks SQL dumps and raw database files", () => {
      const sqlPaths = [
        "/table.sql",
        "/backup.sql",
        "/dump.sql",
        "/database.sql",
        "/schema.sql",
        "/users.sql",
        "/api/table.sql",
        "/data/dump.dmp",
        "/backup.sqlite",
        "/database.sqlite3",
        "/app.db",
        "/db_dump.rdb",
        "/production.psql",
      ];

      for (const p of sqlPaths) {
        assert.equal(isSensitivePath(p), true, `Failed to block: ${p}`);
      }
    });
  });

  describe("isSensitivePath - Backup and temporary files", () => {
    it("blocks backup extensions, swap files, and editor temp files", () => {
      const backupPaths = [
        "/backup.bak",
        "/index.ts.bak",
        "/server.js.backup",
        "/database.old",
        "/app.orig",
        "/data.save",
        "/secret.tmp",
        "/file.txt~",
        "/index.ts~",
        "/.index.ts.swp",
        "/file.swo",
        "/backup.tar",
        "/backup.tar.gz",
        "/database.tgz",
        "/dump.7z",
        "/backup.zip",
      ];

      for (const p of backupPaths) {
        assert.equal(isSensitivePath(p), true, `Failed to block: ${p}`);
      }
    });
  });

  describe("isSensitivePath - Configuration and manifest files", () => {
    it("blocks project manifests, lockfiles, and configs", () => {
      const configPaths = [
        "/package.json",
        "/package-lock.json",
        "/pnpm-lock.yaml",
        "/pnpm-workspace.yaml",
        "/yarn.lock",
        "/tsconfig.json",
        "/tsconfig.base.json",
        "/drizzle.config.ts",
        "/vite.config.ts",
        "/orval.config.ts",
        "/build.mjs",
        "/Dockerfile",
        "/docker-compose.yml",
        "/.npmrc",
        "/.yarnrc",
        "/.editorconfig",
        "/.prettierrc",
      ];

      for (const p of configPaths) {
        assert.equal(isSensitivePath(p), true, `Failed to block: ${p}`);
      }
    });
  });

  describe("isSensitivePath - Path traversal bypass attempts", () => {
    it("blocks encoded and directory traversal attempts", () => {
      const traversalPaths = [
        "/uploads/../../.env",
        "/api/../../.git/config",
        "/static/..%2f..%2ftable.sql",
        "/%2e%2e/%2e%2e/.env",
        "/%252e%252e/%252e%252e/backup.sql",
        "/api/uploads/..\\..\\package.json",
        "/..%2f.env",
      ];

      for (const p of traversalPaths) {
        assert.equal(isSensitivePath(p), true, `Failed to block: ${p}`);
      }
    });
  });

  describe("isSensitivePath - Legitimate public requests", () => {
    it("allows standard, non-sensitive public application routes and assets", () => {
      const legitimatePaths = [
        "/",
        "/index.html",
        "/login",
        "/dashboard",
        "/admin",
        "/api/health",
        "/api/auth/login",
        "/api/widget/chat",
        "/api/widget.js",
        "/favicon.svg",
        "/assets/index-CWLz.js",
        "/assets/style-D_7a.css",
        "/robots.txt",
      ];

      for (const p of legitimatePaths) {
        assert.equal(isSensitivePath(p), false, `Falsely blocked legitimate path: ${p}`);
      }
    });
  });

  describe("sensitiveFilesGuard middleware", () => {
    it("terminates request with 404 Not Found when sensitive file is requested", () => {
      let statusCode = 0;
      let responseBody: any = null;
      let nextCalled = false;

      const mockReq: any = {
        path: "/.env",
        url: "/.env",
        originalUrl: "/.env",
        method: "GET",
        ip: "127.0.0.1",
        socket: {},
      };

      const mockRes: any = {
        status(code: number) {
          statusCode = code;
          return this;
        },
        json(body: any) {
          responseBody = body;
          return this;
        },
      };

      sensitiveFilesGuard(mockReq, mockRes, () => {
        nextCalled = true;
      });

      assert.equal(statusCode, 404);
      assert.deepEqual(responseBody, { error: "Not Found" });
      assert.equal(nextCalled, false, "next() must NEVER be called when sensitive file is blocked");
    });

    it("calls next() for normal application requests", () => {
      let nextCalled = false;

      const mockReq: any = {
        path: "/api/widget.js",
        url: "/api/widget.js",
        originalUrl: "/api/widget.js",
        method: "GET",
        ip: "127.0.0.1",
        socket: {},
      };

      const mockRes: any = {
        status: () => mockRes,
        json: () => mockRes,
      };

      sensitiveFilesGuard(mockReq, mockRes, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, true, "next() must be called for safe public paths");
    });
  });
});
