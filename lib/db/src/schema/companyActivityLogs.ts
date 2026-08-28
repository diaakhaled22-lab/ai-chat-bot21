import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";

export const companyActivityLogsTable = pgTable("company_activity_logs", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  action: text("action").notNull(),
  performedBy: text("performed_by").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CompanyActivityLog = typeof companyActivityLogsTable.$inferSelect;
