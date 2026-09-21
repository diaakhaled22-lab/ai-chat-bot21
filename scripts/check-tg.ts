
import "dotenv/config";
import { db } from "../lib/db/src/index";
import { chatLogsTable } from "../lib/db/src/schema/chatLogs";
import { sql } from "drizzle-orm";

async function main() {
  const logs = await db.select().from(chatLogsTable).orderBy(sql`${chatLogsTable.createdAt} DESC`).limit(5);
  console.log("RECENT CHAT LOGS:");
  console.log(JSON.stringify(logs, null, 2));
  process.exit(0);
}
main().catch(console.error);

