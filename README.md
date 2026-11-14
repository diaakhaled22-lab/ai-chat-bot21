# ai-chat-bot6
chat pot6

### Security & Environment Variables

See `.env.example` for the full template of configuration keys.

- **`ENCRYPTION_KEY`**: 32-byte secret used for AES-256-GCM encryption of sensitive database fields (SMTP credentials, integration tokens, API keys). In production, set this to a secure random string (e.g. `openssl rand -hex 32`).
- **`PLAN_APPROVAL_SECRET`**: Dedicated secret for signing and verifying one-click plan approval links. If missing, the server generates an ephemeral secret (approval links will not survive restarts). Set `REQUIRE_STRICT_SECRETS=true` to make this a required startup secret.
- **`SESSION_SECRET`**: Secret for signing session cookies and pepper for email verification hashes.
- **`INBOUND_EMAIL_WEBHOOK_SECRET`**: Inbound email plan approvals require this variable. Configure the inbound email provider to send its value in the `x-email-webhook-token` request header (the legacy `x-webhook-token` and `x-admin-token` header names are also accepted). Requests are rejected when this secret is missing or invalid, and the sender must also match a configured admin email or admin user. Email approvals are treated as unpaid unless the message explicitly says paid.
- **`TRUSTED_PROXIES`**: Controls Express `trust proxy` to correctly resolve client IPs from `X-Forwarded-*` headers:
  - Behind a **single reverse proxy** (Nginx, Cloudflare, Traefik, Docker with nginx): set to `1`
  - Behind **multiple proxies**: set to the hop count (e.g., `2`) or a comma-separated IP list
  - **No proxy / direct VPS**: leave unset or set to `false` to prevent IP header spoofing
  - Cloud PaaS (Replit, Cloud Run, Render, Railway, Heroku, Fly.io, Vercel) are auto-detected

Login and registration do not trust MAC addresses supplied by browsers; browser clients cannot reliably provide their hardware MAC address. Authentication throttling and temporary lockouts use the server-derived client IP, with lockouts scoped to that username and IP rather than disabling the account globally.

Telegram webhooks use an independently generated secret sent only in Telegram's `X-Telegram-Bot-Api-Secret-Token` header; the secret itself is never part of the webhook URL, and only its SHA-256 hash is stored. After deploying this change, re-register existing Telegram webhooks from the client or admin Telegram settings so Telegram starts using the new URL and secret.

Meta WhatsApp and Messenger webhook POST requests require a valid HMAC signature and a configured `meta_app_secret` (or channel-specific app-secret environment variable). Requests fail closed if the secret or raw request body is unavailable. The server-to-server `/api/webhook/message` endpoint accepts only private Telegram, WhatsApp, or Messenger channel keys; public website widget keys and caller-supplied `botResponse` values are rejected.

Uploaded SVGs are not accepted. Object downloads use safe content headers, and registering an uploaded knowledge file requires an object uploaded by the authenticated client. Temporary uploaded files are always cleaned up from disk.
