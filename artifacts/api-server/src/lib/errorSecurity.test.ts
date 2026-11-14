import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  containsSensitiveErrorInfo,
  sanitizeUserFacingErrorMessage,
  errorSanitizerMiddleware,
  globalErrorHandler,
} from "./errorSecurity";

describe("Error Security & Production Debug Hardening", () => {
  it("detects stack traces, file paths, database tables, and SQL queries", () => {
    // Stack traces
    assert.equal(
      containsSensitiveErrorInfo("Error: boom\n    at Object.execute (C:\\Users\\admin\\app.ts:42:15)"),
      true
    );
    assert.equal(
      containsSensitiveErrorInfo("Unhandled rejection at async processTicksAndRejections (node:internal:49:5)"),
      true
    );
    assert.equal(containsSensitiveErrorInfo("error in route: /workspace/artifacts/api-server/src/index.ts:15:3"), true);

    // Windows & Linux file paths
    assert.equal(containsSensitiveErrorInfo("ENOENT: no such file or directory, open 'C:\\Users\\diaak\\Desktop\\bot'"), true);
    assert.equal(containsSensitiveErrorInfo("failed to open /workspace/artifacts/api-server/dist/index.mjs"), true);

    // Database tables, relations, and SQL
    assert.equal(containsSensitiveErrorInfo('relation "companiesTable" does not exist'), true);
    assert.equal(containsSensitiveErrorInfo('null value in column "clientId" of relation "tickets" violates not-null constraint'), true);
    assert.equal(containsSensitiveErrorInfo('duplicate key value violates unique constraint "users_email_unique"'), true);
    assert.equal(containsSensitiveErrorInfo("syntax error at or near 'SELECT' in query: SELECT * FROM users"), true);
    assert.equal(containsSensitiveErrorInfo("drizzle-orm query failed on table usersTable"), true);

    // Safe client-friendly messages should NOT match sensitive patterns
    assert.equal(containsSensitiveErrorInfo("Title and description are required"), false);
    assert.equal(containsSensitiveErrorInfo("Invalid email address format"), false);
    assert.equal(containsSensitiveErrorInfo("Password must be at least 8 characters long"), false);
    assert.equal(containsSensitiveErrorInfo("البريد الإلكتروني أو كلمة المرور غير صحيحة"), false);
  });

  it("sanitizes 5xx errors to a generic message in production with no leakage", () => {
    const rawErrors = [
      "Error: Database connection failed at pgPool.connect (C:\\app\\db.ts:10:5)",
      'syntax error in query: select * from "companiesTable"',
      "ENOENT: open 'C:\\Users\\admin\\secret.pem'",
      "Internal server error: usersTable is locked",
    ];

    for (const raw of rawErrors) {
      const sanitized = sanitizeUserFacingErrorMessage(raw, 500, true);
      assert.equal(sanitized, "An unexpected error occurred. Please try again later.");
      assert.equal(containsSensitiveErrorInfo(sanitized), false);
    }
  });

  it("sanitizes 4xx errors containing internal paths or tables to safe generic validation error", () => {
    const internalErrors = [
      'violates foreign key constraint on table "companiesTable"',
      "failed parsing path C:\\Users\\diaak\\Desktop\\file.pdf",
      'null value in column "clientId" of relation "ticketsTable"',
    ];

    for (const raw of internalErrors) {
      const sanitized = sanitizeUserFacingErrorMessage(raw, 400, true);
      assert.equal(sanitized, "Invalid request. Please verify your input and try again.");
      assert.equal(containsSensitiveErrorInfo(sanitized), false);
    }
  });

  it("preserves safe, non-sensitive client validation errors for 4xx status codes", () => {
    const safeValidationMessages = [
      "Title and description are required",
      "Email already exists",
      "Password must be at least 8 characters long",
      "اسم المستخدم مطلوب",
    ];

    for (const msg of safeValidationMessages) {
      const sanitized = sanitizeUserFacingErrorMessage(msg, 400, true);
      assert.equal(sanitized, msg);
    }
  });

  it("response sanitizer middleware intercepts res.json and strips stack traces and internal leakage", () => {
    process.env.NODE_ENV = "production";

    let capturedBody: any = null;
    const mockRes: any = {
      statusCode: 500,
      json: function (body: any) {
        capturedBody = body;
        return this;
      },
      send: function (body: any) {
        capturedBody = body;
        return this;
      },
    };

    errorSanitizerMiddleware({} as any, mockRes, () => {});

    // Controller tries to send internal error with stack trace and table names
    mockRes.json({
      error: 'Query failed: SELECT * FROM "usersTable" WHERE id = 1',
      details: "Error at C:\\Users\\admin\\app.ts:50:10",
      stack: "Error: Query failed\n    at executeQuery (C:\\Users\\admin\\app.ts:50:10)",
    });

    assert.equal(capturedBody.error, "An unexpected error occurred. Please try again later.");
    assert.equal(capturedBody.details, "An unexpected error occurred. Please try again later.");
    assert.equal("stack" in capturedBody, false, "stack trace must be stripped");
  });

  it("global error handler logs internally and sends generic error response", () => {
    process.env.NODE_ENV = "production";

    let capturedStatus: number | null = null;
    let capturedBody: any = null;

    const mockReq: any = {
      method: "POST",
      path: "/api/test",
      originalUrl: "/api/test",
      ip: "127.0.0.1",
      session: { userId: 1 },
    };

    const mockRes: any = {
      headersSent: false,
      statusCode: 200,
      status: function (code: number) {
        capturedStatus = code;
        this.statusCode = code;
        return this;
      },
      json: function (body: any) {
        capturedBody = body;
        return this;
      },
    };

    const testError = new Error('Database relation "usersTable" is missing at C:\\Users\\admin\\db.ts:99:1');

    globalErrorHandler(testError, mockReq, mockRes, () => {});

    assert.equal(capturedStatus, 500);
    assert.equal(capturedBody.error, "An unexpected error occurred. Please try again later.");
    assert.equal(containsSensitiveErrorInfo(capturedBody.error), false);
  });
});
