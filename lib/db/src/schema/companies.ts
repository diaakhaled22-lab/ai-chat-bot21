import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const companiesTable = pgTable("companies", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  myId: text("my_id"),
  generalInfo: text("general_info"),
  isActive: boolean("is_active").notNull().default(false),
  activationStart: timestamp("activation_start", { withTimezone: true }),
  activationEnd: timestamp("activation_end", { withTimezone: true }),
  systemPrompt: text("system_prompt"),
  googleSheetsEnabled: boolean("google_sheets_enabled").notNull().default(false),
  googleSheetsLink: text("google_sheets_link"),
  googleSheetsName: text("google_sheets_name"),
  googleSheetsPage: text("google_sheets_page"),
  serviceAccountKey: text("service_account_key"),
  aiAgentApiKey: text("ai_agent_api_key"),
  aiAgentUrl: text("ai_agent_url"),
  aiProvider: text("ai_provider", { enum: ["openai", "anthropic", "google", "openrouter"] }),
  aiModel: text("ai_model"),
  monthlyTokenQuota: integer("monthly_token_quota"),
  telegramBotApiKey: text("telegram_bot_api_key"),
  telegramBotUsername: text("telegram_bot_username"),
  whatsappApiToken: text("whatsapp_api_token"),
  whatsappPhoneNumberId: text("whatsapp_phone_number_id"),
  whatsappBusinessAccountId: text("whatsapp_business_account_id"),
  whatsappNumber: text("whatsapp_number"),
  messengerApiKey: text("messenger_api_key"),
  messengerPageId: text("messenger_page_id"),
  websiteChatbotKey: text("website_chatbot_key"),
  websiteDataUrl: text("website_data_url"),
  websiteAutoSync: boolean("website_auto_sync").notNull().default(false),
  websiteContentCache: text("website_content_cache"),
  websiteLastSynced: timestamp("website_last_synced", { withTimezone: true }),
  fabEnabled: boolean("fab_enabled").notNull().default(false),
  fabPositionX: integer("fab_position_x").notNull().default(92),
  fabPositionY: integer("fab_position_y").notNull().default(86),
  chatLogRetentionDays: integer("chat_log_retention_days"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCompanySchema = createInsertSchema(companiesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Company = typeof companiesTable.$inferSelect;
