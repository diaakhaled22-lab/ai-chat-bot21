import { db, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const query = db.update(usersTable).set({ deletedAt: new Date() }).where(and(eq(usersTable.id, 1), eq(usersTable.role, "client"))).toSQL();
console.log(query.sql);
console.log(query.params);
