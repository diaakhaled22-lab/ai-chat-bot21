import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { companiesTable } from "./companies";

export const companyKnowledgeFilesTable = pgTable("company_knowledge_files", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  fileType: text("file_type", { enum: ["pdf", "excel", "csv", "json", "google_sheet", "txt"] }).notNull(),
  objectPath: text("object_path"),
  sourceUrl: text("source_url"),
  fileSize: integer("file_size"),
  status: text("status", { enum: ["processing", "ready", "error"] }).notNull().default("processing"),
  errorMessage: text("error_message"),
  extractedText: text("extracted_text"),
  chunkCount: integer("chunk_count").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const companyKnowledgeChunksTable = pgTable("company_knowledge_chunks", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  fileId: integer("file_id").notNull().references(() => companyKnowledgeFilesTable.id, { onDelete: "cascade" }),
  chunkIndex: integer("chunk_index").notNull(),
  content: text("content").notNull(),
  tokenCount: integer("token_count"),
  embeddingJson: text("embedding_json"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCompanyKnowledgeFileSchema = createInsertSchema(companyKnowledgeFilesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCompanyKnowledgeFile = z.infer<any>;
export type CompanyKnowledgeFile = typeof companyKnowledgeFilesTable.$inferSelect;
export type CompanyKnowledgeChunk = typeof companyKnowledgeChunksTable.$inferSelect;
export type InsertCompanyKnowledgeChunk = typeof companyKnowledgeChunksTable.$inferInsert;
