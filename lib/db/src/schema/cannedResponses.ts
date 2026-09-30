import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";

export const cannedResponsesTable = pgTable("canned_responses", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id")
    .references(() => companiesTable.id, { onDelete: "cascade" })
    .notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
