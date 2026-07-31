---
name: Messenger channel addition
description: How the Facebook Messenger channel was added alongside Telegram/WhatsApp — pattern to follow for any future channel additions
---

Facebook Messenger was added as a fourth chat channel in the AI chatbot admin platform, following the existing Telegram/WhatsApp pattern exactly.

**Pattern for adding a new channel to this project:**
1. Add a single `<channel>ApiKey` text column to `companies` (one field per channel, not split into multiple secrets) + add the channel name to the `chatLogs.channel` enum.
2. Mirror the same additions in `lib/api-spec/openapi.yaml` (Company/CompanyInput schemas, ChatLog/WebhookMessageInput channel enums, description text), then run `pnpm --filter @workspace/api-spec run codegen` to regenerate zod + React Query client.
3. Give the channel its own dedicated route file (like `telegram.ts`) rather than routing it through the generic two-phase `webhook.ts` — that generic file is reserved for WhatsApp/Website only.
4. Explicitly whitelist the new field in every read/write spot in `client.ts` and `admin.ts` (fields are not passed through automatically; each GET/POST/PUT response object and update block lists channel keys by name).
5. Update `ClientCompany.tsx`: formSchema, defaultValues/reset, onSubmit null-coalescing, the Channels FormField grid, the masked "Channel Secrets" list, the "How It All Works" per-channel status tiles, and the webhook docs channel-key grid — all six spots list channels together and need the new one added in parallel.

**Why:** Keeps every channel structurally identical (one API key field, same AI-generation logic reused via a `callAI`-equivalent, same chatLogs/Google Sheets sync), so future channels are cheap to add and the UI stays consistent instead of accumulating one-off code paths.

**Messenger-specific difference:** Meta has no "setWebhook" API call like Telegram — the webhook URL and Verify Token must be entered manually in the Meta App Dashboard. The client UI shows both values with copy buttons instead of Telegram's one-click "Register Webhook" button. The verify token reuses the same company API key value (secrecy-by-URL), consistent with Telegram's existing security tradeoff in this codebase — not a separate dashboard-configured secret.
