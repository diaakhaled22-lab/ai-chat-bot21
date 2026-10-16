import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { companiesTable } from "./companies";

export const companyRestApiIntegrationsTable = pgTable("company_rest_api_integrations", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().unique().references(() => companiesTable.id, { onDelete: "cascade" }),
  apiUrl: text("api_url").notNull(),
  httpMethod: text("http_method").notNull().default("GET"),
  headerName: text("header_name"),
  headerValue: text("header_value"),
  dataExtractionPath: text("data_extraction_path"),
  status: text("status", { enum: ["pending", "connected", "error"] }).notNull().default("pending"),
  errorMessage: text("error_message"),
  autoSync: boolean("auto_sync").notNull().default(true),
  lastSynced: timestamp("last_synced", { withTimezone: true }),
  contentCache: text("content_cache"),
  totalItems: integer("total_items").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCompanyRestApiIntegrationSchema = createInsertSchema(
  companyRestApiIntegrationsTable
).omit({ id: true, createdAt: true, updatedAt: true });

export type InsertCompanyRestApiIntegration = z.infer<any>;
export type CompanyRestApiIntegration =
  typeof companyRestApiIntegrationsTable.$inferSelect;
