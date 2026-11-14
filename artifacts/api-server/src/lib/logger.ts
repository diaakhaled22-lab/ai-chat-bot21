import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers['set-cookie']",
      "password",
      "passwordHash",
      "currentPassword",
      "newPassword",
      "oldPassword",
      "confirmPassword",
      "*.password",
      "*.passwordHash",
      "*.currentPassword",
      "*.newPassword",
      "*.oldPassword",
      "*.confirmPassword",
      "*.*.password",
      "*.*.passwordHash",
      "*.*.currentPassword",
      "*.*.newPassword",
      "req.body.password",
      "req.body.currentPassword",
      "req.body.newPassword",
      "req.body.confirmPassword",
      "secret",
      "*.secret",
      "*.*.secret",
      "token",
      "*.token",
      "*.*.token",
      "apiKey",
      "*.apiKey",
      "*.*.apiKey",
      "twoFactorSecret",
      "*.twoFactorSecret",
      "backupCodes",
      "*.backupCodes",
    ],
    censor: "[REDACTED]",
  },
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});
