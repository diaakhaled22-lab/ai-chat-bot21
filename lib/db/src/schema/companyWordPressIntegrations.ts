import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";

export const companyWordPressIntegrationsTable = pgTable("company_wordpress_integrations", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().unique().references(() => companiesTable.id, { onDelete: "cascade" }),
  apiUrl: text("api_url").notNull(),
  username: text("username"),
  appPassword: text("app_password"),
  status: text("status", { enum: ["pending", "connected", "error"] }).notNull().default("pending"),
  errorMessage: text("error_message"),
  autoSync: boolean("auto_sync").notNull().default(true),
  lastSynced: timestamp("last_synced", { withTimezone: true }),
  contentCache: text("content_cache"),
  totalItems: integer("total_items").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCompanyWordPressIntegrationSchema = createInsertSchema(
  companyWordPressIntegrationsTable
).omit({ id: true, createdAt: true, updatedAt: true });

export type InsertCompanyWordPressIntegration = z.infer<
  typeof insertCompanyWordPressIntegrationSchema
>;
export type CompanyWordPressIntegration =
  typeof companyWordPressIntegrationsTable.$inferSelect;
