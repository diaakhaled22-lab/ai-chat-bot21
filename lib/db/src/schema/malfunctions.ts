import { pgTable, serial, text, timestamp, boolean } from "drizzle-orm/pg-core";

export const malfunctionsTable = pgTable("malfunctions", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at"),
});