-- ==============================================================================
-- DATABASE SECURITY HARDENING: ROW LEVEL SECURITY (RLS) & LEAST PRIVILEGE ROLES
-- Database: PostgreSQL 14+
--
-- USAGE:
-- The application user password MUST be passed explicitly via psql variable (pass):
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v pass='YOUR_STRONG_PASSWORD_HERE' -f scripts/security_rls_and_roles.sql
--
-- DO NOT hardcode passwords or defaults in this script. Execution will abort if
-- :pass is undefined or empty.
-- ==============================================================================

-- Ensure execution aborts immediately on error
\set ON_ERROR_STOP on

-- Validate that :pass variable was passed via psql command-line (-v pass=...)
-- Abort with a clear error message if :pass is missing or empty.
DO $check$
DECLARE
  app_pass text := :'pass';
BEGIN
  IF app_pass IS NULL OR length(trim(app_pass)) = 0 THEN
    RAISE EXCEPTION 'FATAL: Application database password must be passed explicitly via psql variable. Example: psql "$DATABASE_URL" -v pass=''YOUR_STRONG_PASSWORD'' -f scripts/security_rls_and_roles.sql';
  END IF;
END $check$;

-- ------------------------------------------------------------------------------
-- PART 1: LEAST-PRIVILEGE APPLICATION ROLE SETUP
-- ------------------------------------------------------------------------------
-- In production, the web application (Node.js / Express / Drizzle ORM) should
-- connect using a dedicated runtime role that only has DML permissions
-- (SELECT, INSERT, UPDATE, DELETE). It must NOT have DDL permissions
-- (CREATE, ALTER, DROP, TRUNCATE) or SUPERUSER privileges.

DO $setup$
DECLARE
  app_pass text := :'pass';
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'chatbot_app_user') THEN
    EXECUTE format('CREATE ROLE chatbot_app_user WITH LOGIN PASSWORD %L', app_pass);
  ELSE
    EXECUTE format('ALTER ROLE chatbot_app_user WITH LOGIN PASSWORD %L', app_pass);
  END IF;
END $setup$;

-- Revoke default public permissions on public schema
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO chatbot_app_user;

-- Grant only required DML operations on all existing tables
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO chatbot_app_user;

-- Grant usage on all existing sequences (for auto-increment SERIAL / BIGSERIAL primary keys)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO chatbot_app_user;

-- Ensure future tables created by migrations also follow least privilege
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO chatbot_app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO chatbot_app_user;


-- ------------------------------------------------------------------------------
-- PART 2: ENABLE ROW LEVEL SECURITY (RLS) ON ALL TENANT-SPECIFIC TABLES
-- ------------------------------------------------------------------------------

-- 1. Companies Table
ALTER TABLE IF EXISTS companies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS companies_isolation_policy ON companies;
CREATE POLICY companies_isolation_policy ON companies
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'admin'
    OR client_id = NULLIF(current_setting('app.current_user_id', true), '')::integer
  );

-- 2. Tickets Table
ALTER TABLE IF EXISTS tickets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tickets_isolation_policy ON tickets;
CREATE POLICY tickets_isolation_policy ON tickets
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'admin'
    OR client_id = NULLIF(current_setting('app.current_user_id', true), '')::integer
  );

-- 3. Leads Table
ALTER TABLE IF EXISTS leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leads_isolation_policy ON leads;
CREATE POLICY leads_isolation_policy ON leads
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'admin'
    OR company_id IN (
      SELECT id FROM companies 
      WHERE client_id = NULLIF(current_setting('app.current_user_id', true), '')::integer
    )
  );

-- 4. Chat Logs Table
ALTER TABLE IF EXISTS chat_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chat_logs_isolation_policy ON chat_logs;
CREATE POLICY chat_logs_isolation_policy ON chat_logs
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'admin'
    OR company_id IN (
      SELECT id FROM companies 
      WHERE client_id = NULLIF(current_setting('app.current_user_id', true), '')::integer
    )
  );

-- 5. Notifications Table
ALTER TABLE IF EXISTS notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notifications_isolation_policy ON notifications;
CREATE POLICY notifications_isolation_policy ON notifications
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'admin'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')::integer
  );

-- 6. Knowledge Files Table
ALTER TABLE IF EXISTS company_knowledge_files ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS knowledge_files_isolation_policy ON company_knowledge_files;
CREATE POLICY knowledge_files_isolation_policy ON company_knowledge_files
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'admin'
    OR company_id IN (
      SELECT id FROM companies 
      WHERE client_id = NULLIF(current_setting('app.current_user_id', true), '')::integer
    )
  );

-- 7. Canned Responses Table
ALTER TABLE IF EXISTS canned_responses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS canned_responses_isolation_policy ON canned_responses;
CREATE POLICY canned_responses_isolation_policy ON canned_responses
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'admin'
    OR company_id IN (
      SELECT id FROM companies 
      WHERE client_id = NULLIF(current_setting('app.current_user_id', true), '')::integer
    )
  );

-- 8. Rest API Integrations Table
ALTER TABLE IF EXISTS company_rest_api_integrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rest_api_isolation_policy ON company_rest_api_integrations;
CREATE POLICY rest_api_isolation_policy ON company_rest_api_integrations
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'admin'
    OR company_id IN (
      SELECT id FROM companies 
      WHERE client_id = NULLIF(current_setting('app.current_user_id', true), '')::integer
    )
  );

-- 9. WordPress Integrations Table
ALTER TABLE IF EXISTS company_word_press_integrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wordpress_isolation_policy ON company_word_press_integrations;
CREATE POLICY wordpress_isolation_policy ON company_word_press_integrations
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'admin'
    OR company_id IN (
      SELECT id FROM companies 
      WHERE client_id = NULLIF(current_setting('app.current_user_id', true), '')::integer
    )
  );

-- 10. Shopify Integrations Table
ALTER TABLE IF EXISTS company_shopify_integrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shopify_isolation_policy ON company_shopify_integrations;
CREATE POLICY shopify_isolation_policy ON company_shopify_integrations
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'admin'
    OR company_id IN (
      SELECT id FROM companies 
      WHERE client_id = NULLIF(current_setting('app.current_user_id', true), '')::integer
    )
  );

-- 11. Malfunctions Table
ALTER TABLE IF EXISTS malfunctions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS malfunctions_isolation_policy ON malfunctions;
CREATE POLICY malfunctions_isolation_policy ON malfunctions
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'admin'
    OR company_id IN (
      SELECT id FROM companies 
      WHERE client_id = NULLIF(current_setting('app.current_user_id', true), '')::integer
    )
  );

-- 12. Conversations & Messages
ALTER TABLE IF EXISTS conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS conversations_isolation_policy ON conversations;
CREATE POLICY conversations_isolation_policy ON conversations
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'admin'
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')::integer
  );

ALTER TABLE IF EXISTS messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS messages_isolation_policy ON messages;
CREATE POLICY messages_isolation_policy ON messages
  FOR ALL
  USING (
    current_setting('app.current_role', true) = 'admin'
    OR conversation_id IN (
      SELECT id FROM conversations
      WHERE user_id = NULLIF(current_setting('app.current_user_id', true), '')::integer
    )
  );

-- ------------------------------------------------------------------------------
-- VERIFICATION NOTE:
-- In Node.js, when using connection pooling with session variables, execute:
-- SET LOCAL app.current_user_id = '<userId>';
-- SET LOCAL app.current_role = '<role>';
-- inside the transaction block for complete kernel-level database isolation.
-- ------------------------------------------------------------------------------
