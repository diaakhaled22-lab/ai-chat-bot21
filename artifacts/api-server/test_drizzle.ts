import { db, usersTable } from "@workspace/db";
const query = db.select().from(usersTable).toSQL();
console.log(query.sql);
