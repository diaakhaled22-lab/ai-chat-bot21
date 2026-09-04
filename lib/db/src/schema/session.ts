import { pgTable, varchar, timestamp, json, index } from "drizzle-orm/pg-core";

export const sessionTable = pgTable("session", {
  sid: varchar("sid").primaryKey(),
  sess: json("sess").notNull(),
  expire: timestamp("expire", { precision: 6 }).notNull(),
}, (table) => {
  return {
    expireIdx: index("IDX_session_expire").on(table.expire),
  };
});
