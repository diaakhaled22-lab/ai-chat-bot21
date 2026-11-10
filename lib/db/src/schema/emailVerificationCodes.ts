import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";

export const emailVerificationCodesTable = pgTable("email_verification_codes", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  code: text("code").notNull(),
  attempts: integer("attempts").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type EmailVerificationCode = typeof emailVerificationCodesTable.$inferSelect;
