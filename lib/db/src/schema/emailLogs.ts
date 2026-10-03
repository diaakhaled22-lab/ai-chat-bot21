import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";

export const emailLogsTable = pgTable("email_logs", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  recipientEmail: text("recipient_email").notNull(),
  subject: text("subject").notNull(),
  eventType: text("event_type"),
  status: text("status", { enum: ["sent", "failed", "skipped"] }).notNull(),
  error: text("error"),
  resendId: text("resend_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type EmailLog = typeof emailLogsTable.$inferSelect;
