/**
 * Seeds and initializes the database (Repeatable & Idempotent).
 * 
 * Safe to run multiple times without duplicating data or breaking constraints.
 * Run: pnpm --filter @workspace/scripts run seed
 */
import { Client } from "pg";
import bcrypt from "bcryptjs";

const DDL_STATEMENTS = [
  // Users table
  `CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'client',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  // Companies table
  `CREATE TABLE IF NOT EXISTS companies (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    my_id TEXT,
    general_info TEXT,
    is_active BOOLEAN NOT NULL DEFAULT false,
    activation_start TIMESTAMPTZ,
    activation_end TIMESTAMPTZ,
    system_prompt TEXT,
    google_sheets_enabled BOOLEAN NOT NULL DEFAULT false,
    google_sheets_link TEXT,
    google_sheets_name TEXT,
    google_sheets_page TEXT,
    service_account_key TEXT,
    ai_agent_api_key TEXT,
    ai_agent_url TEXT,
    ai_provider TEXT,
    ai_model TEXT,
    monthly_token_quota INTEGER,
    telegram_bot_api_key TEXT,
    telegram_bot_username TEXT,
    whatsapp_api_token TEXT,
    whatsapp_phone_number_id TEXT,
    whatsapp_business_account_id TEXT,
    whatsapp_number TEXT,
    messenger_api_key TEXT,
    messenger_page_id TEXT,
    website_chatbot_key TEXT,
    website_data_url TEXT,
    website_auto_sync BOOLEAN NOT NULL DEFAULT false,
    website_content_cache TEXT,
    website_last_synced TIMESTAMPTZ,
    fab_enabled BOOLEAN NOT NULL DEFAULT false,
    fab_position_x INTEGER NOT NULL DEFAULT 96,
    fab_position_y INTEGER NOT NULL DEFAULT 92,
    chat_log_retention_days INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  // Chat logs table
  `CREATE TABLE IF NOT EXISTS chat_logs (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    channel TEXT NOT NULL,
    session_id TEXT NOT NULL,
    customer_message TEXT NOT NULL,
    bot_response TEXT NOT NULL,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  // Tickets table
  `CREATE TABLE IF NOT EXISTS tickets (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    priority TEXT NOT NULL DEFAULT 'medium',
    ai_resolution TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  // Admin config table
  `CREATE TABLE IF NOT EXISTS admin_config (
    id SERIAL PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    value TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  // Company Activity Logs table
  `CREATE TABLE IF NOT EXISTS company_activity_logs (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    details TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  // Notifications table
  `CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  // Password reset tokens table
  `CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  // Conversations table
  `CREATE TABLE IF NOT EXISTS conversations (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    channel TEXT NOT NULL,
    session_id TEXT NOT NULL,
    customer_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  // Messages table
  `CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    tokens INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  // Company Knowledge Files table
  `CREATE TABLE IF NOT EXISTS company_knowledge_files (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL,
    source_url TEXT,
    status TEXT NOT NULL DEFAULT 'ready',
    error_message TEXT,
    content_cache TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  // Company WordPress Integrations table
  `CREATE TABLE IF NOT EXISTS company_wordpress_integrations (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE UNIQUE,
    api_url TEXT NOT NULL,
    username TEXT,
    app_password_enc TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    error_message TEXT,
    auto_sync BOOLEAN NOT NULL DEFAULT true,
    last_synced TIMESTAMPTZ,
    total_items INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,
];

async function seed() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("❌ DATABASE_URL environment variable is required.");
    process.exit(1);
  }

  console.log("🔄 Connecting to database...");
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    console.log("📦 Ensuring all database tables exist...");
    for (const sql of DDL_STATEMENTS) {
      await client.query(sql);
    }
    console.log("✅ Tables verified.");

    // Seed default admin user
    const adminPasswordHash = await bcrypt.hash("admin123", 10);
    await client.query(
      `INSERT INTO users (name, username, password_hash, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (username) DO NOTHING`,
      ["System Admin", "admin", adminPasswordHash, "admin"]
    );
    console.log("✅ Default Admin user ready (username: admin / password: admin123)");

    // Seed default demo client user
    const clientPasswordHash = await bcrypt.hash("client123", 10);
    const clientRes = await client.query(
      `INSERT INTO users (name, username, password_hash, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (username) DO NOTHING
       RETURNING id;`,
      ["Acme Demo Client", "client", clientPasswordHash, "client"]
    );

    let clientId = clientRes.rows[0]?.id;
    if (!clientId) {
      const q = await client.query(`SELECT id FROM users WHERE username = 'client' LIMIT 1;`);
      clientId = q.rows[0]?.id;
    }

    if (clientId) {
      await client.query(
        `INSERT INTO companies (client_id, name, is_active, monthly_token_quota, system_prompt)
         SELECT $1, 'Acme Corp', true, 1000000, 'You are an AI assistant for Acme Corp. Help customers with their inquiries politely and concisely.'
         WHERE NOT EXISTS (SELECT 1 FROM companies WHERE client_id = $1);`,
        [clientId]
      );
      console.log("✅ Default Client user & company ready (username: client / password: client123)");
    }

    // Seed initial admin config
    await client.query(
      `INSERT INTO admin_config (key, value)
       VALUES 
         ('default_monthly_token_quota', '1000000'),
         ('ai_providers_enabled', 'openai,anthropic,google,openrouter')
       ON CONFLICT (key) DO NOTHING;`
    );
    console.log("✅ Initial admin config ready.");
    console.log("🎉 Fresh database setup is complete and ready!");
  } finally {
    await client.end();
  }
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
