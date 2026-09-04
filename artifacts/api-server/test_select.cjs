const { pgTable, serial, text, timestamp } = require("drizzle-orm/pg-core");
const { drizzle } = require("drizzle-orm/node-postgres");

const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name"),
  deletedAt: timestamp("deleted_at")
});

const db = drizzle(null);
const query = db.select().from(usersTable).toSQL();
console.log(query);
