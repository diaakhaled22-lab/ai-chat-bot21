import { pgTable, serial, text, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";

export const malfunctionsTable = pgTable("malfunctions", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companiesTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at"),
});