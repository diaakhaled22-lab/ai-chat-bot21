import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { companiesTable } from "./companies";

export const companyShopifyIntegrationsTable = pgTable("company_shopify_integrations", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().unique().references(() => companiesTable.id, { onDelete: "cascade" }),
  shopDomain: text("shop_domain").notNull(),
  accessToken: text("access_token"),
  apiVersion: text("api_version").notNull().default("2024-01"),
  status: text("status", { enum: ["pending", "connected", "error"] }).notNull().default("pending"),
  errorMessage: text("error_message"),
  autoSync: boolean("auto_sync").notNull().default(true),
  lastSynced: timestamp("last_synced", { withTimezone: true }),
  contentCache: text("content_cache"),
  totalItems: integer("total_items").notNull().default(0),
  shopName: text("shop_name"),
  shopCurrency: text("shop_currency"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCompanyShopifyIntegrationSchema = createInsertSchema(
  companyShopifyIntegrationsTable
).omit({ id: true, createdAt: true, updatedAt: true });

export type InsertCompanyShopifyIntegration = z.infer<any>;
export type CompanyShopifyIntegration =
  typeof companyShopifyIntegrationsTable.$inferSelect;
