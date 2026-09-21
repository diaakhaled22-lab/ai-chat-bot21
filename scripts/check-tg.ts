
import "dotenv/config";
import { db } from "../lib/db/src/index";
import { companiesTable } from "../lib/db/src/schema/companies";
import { isNotNull } from "drizzle-orm";

async function main() {
  const [c] = await db.select().from(companiesTable).where(isNotNull(companiesTable.telegramBotApiKey)).limit(1);
  console.log("Token:", c?.telegramBotApiKey?.substring(0,10) + "...");
  process.exit(0);
}
main();

