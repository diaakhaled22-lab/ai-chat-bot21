# ai-chat-bot6
chat pot6

Inbound email plan approvals require the `INBOUND_EMAIL_WEBHOOK_SECRET` environment variable. Configure the inbound email provider to send its value in the `x-email-webhook-token` request header (the legacy `x-webhook-token` and `x-admin-token` header names are also accepted). Requests are rejected when this secret is missing or invalid, and the sender must also match a configured admin email or admin user. Email approvals are treated as unpaid unless the message explicitly says paid.

When deploying behind a reverse proxy, set `TRUSTED_PROXIES` to a comma-separated list of the proxy IP addresses or CIDR ranges. Forwarded client IP headers are ignored unless they come through one of these trusted proxies.

Login and registration do not trust MAC addresses supplied by browsers; browser clients cannot reliably provide their hardware MAC address. Authentication throttling and temporary lockouts use the server-derived client IP, with lockouts scoped to that username and IP rather than disabling the account globally.

Telegram webhooks use an independently generated secret sent only in Telegram's `X-Telegram-Bot-Api-Secret-Token` header; the secret itself is never part of the webhook URL, and only its SHA-256 hash is stored. After deploying this change, re-register existing Telegram webhooks from the client or admin Telegram settings so Telegram starts using the new URL and secret.

Meta WhatsApp and Messenger webhook POST requests require a valid HMAC signature and a configured `meta_app_secret` (or channel-specific app-secret environment variable). Requests fail closed if the secret or raw request body is unavailable. The server-to-server `/api/webhook/message` endpoint accepts only private Telegram, WhatsApp, or Messenger channel keys; public website widget keys and caller-supplied `botResponse` values are rejected.

Uploaded SVGs are not accepted. Object downloads use safe content headers, and registering an uploaded knowledge file requires an object uploaded by the authenticated client.
