/**
 * Seeds the database with a default admin user if none exists.
 * Run: pnpm --filter @workspace/scripts run seed
 */
import { Client } from "pg";
import bcrypt from "bcryptjs";

async function seed() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const { rows } = await client.query(
      `SELECT id FROM users WHERE role = 'admin' LIMIT 1`
    );

    if (rows.length > 0) {
      console.log("Admin user already exists — skipping seed.");
      return;
    }

    const passwordHash = await bcrypt.hash("admin123", 10);
    await client.query(
      `INSERT INTO users (name, username, password_hash, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (username) DO NOTHING`,
      ["Admin", "admin", passwordHash, "admin"]
    );

    console.log("✓ Admin user created (username: admin, password: admin123)");
    console.log("  ⚠️  Change the password after first login.");
  } finally {
    await client.end();
  }
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
