
import "dotenv/config";
import { db } from "../lib/db/src/index";
import { chatLogsTable } from "../lib/db/src/schema/chatLogs";
import { companiesTable } from "../lib/db/src/schema/companies";
import { sql, eq } from "drizzle-orm";

async function main() {
  const c = await db.select().from(companiesTable).limit(2);
  console.log("Companies:", JSON.stringify(c.map(x => ({id: x.id, clientId: x.clientId})), null, 2));

  const logs = await db.select().from(chatLogsTable).orderBy(sql`${chatLogsTable.createdAt} DESC`).limit(5);
  console.log("RECENT CHAT LOGS:", JSON.stringify(logs, null, 2));
  process.exit(0);
}
main().catch(console.error);

