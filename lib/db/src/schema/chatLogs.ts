import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { companiesTable } from "./companies";

export const chatLogsTable = pgTable("chat_logs", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  channel: text("channel", { enum: ["telegram", "whatsapp", "messenger", "website"] }).notNull(),
  sessionId: text("session_id"),
  customerMessage: text("customer_message").notNull(),
  botResponse: text("bot_response"),
  isRead: boolean("is_read").notNull().default(false),
  isHumanReply: boolean("is_human_reply").notNull().default(false),
  isHandoff: boolean("is_handoff").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertChatLogSchema = createInsertSchema(chatLogsTable).omit({ id: true, createdAt: true });
export type InsertChatLog = z.infer<any> // typeof insertChatLogSchema>;
export type ChatLog = typeof chatLogsTable.$inferSelect;
