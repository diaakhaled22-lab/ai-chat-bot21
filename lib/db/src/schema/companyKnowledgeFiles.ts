import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";

export const companyKnowledgeFilesTable = pgTable("company_knowledge_files", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  fileType: text("file_type", { enum: ["pdf", "excel", "csv", "json", "google_sheet"] }).notNull(),
  objectPath: text("object_path"),
  sourceUrl: text("source_url"),
  fileSize: integer("file_size"),
  status: text("status", { enum: ["processing", "ready", "error"] }).notNull().default("processing"),
  errorMessage: text("error_message"),
  extractedText: text("extracted_text"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCompanyKnowledgeFileSchema = createInsertSchema(companyKnowledgeFilesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCompanyKnowledgeFile = z.infer<typeof insertCompanyKnowledgeFileSchema>;
export type CompanyKnowledgeFile = typeof companyKnowledgeFilesTable.$inferSelect;
