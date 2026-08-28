import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";

export const adminConfigTable = pgTable("admin_config", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
