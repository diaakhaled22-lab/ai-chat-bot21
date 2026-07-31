---
name: OpenRouter integration pattern
description: How OpenRouter is wired in this project — lazy client, own API key, provider scoping
---

The project uses a lazy Proxy pattern for OpenRouter client init (same as OpenAI client).
User declined Replit AI Integrations upgrade, so OPENROUTER_API_KEY is a real user-supplied secret.
Client lives in lib/integrations-openrouter-ai/src/client.ts.
The template client.ts from the skill throws at import time — always replace with a lazy Proxy.
Batch utilities require p-limit and p-retry in the lib's package.json (template does not include them).

**Why:** Replit AI Integrations are account-tier-gated. Falling back to user key avoids the upgrade wall.
**How to apply:** Any future AI integration that fails setupReplitAIIntegrations → use requestSecrets + lazy proxy pattern.
