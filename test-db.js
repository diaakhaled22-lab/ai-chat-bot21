
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);
import { sql } from "drizzle-orm";

async function main() {
  const result = await db.execute(sql`SELECT channel, session_id, customer_message FROM chat_logs ORDER BY created_at DESC LIMIT 5`);
  console.log(result.rows);
  process.exit(0);
}
main().catch(console.error);

