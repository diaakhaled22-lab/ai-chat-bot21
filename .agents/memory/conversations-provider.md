---
name: Conversations provider column
description: The conversations table has a provider column to distinguish OpenAI vs OpenRouter rows
---

conversations.provider values:
- 'openai' — OpenAI route conversations
- 'openrouter-free' — OpenRouter free model (google/gemma-4-31b-it:free)
- 'openrouter-full' — OpenRouter paid model (deepseek/deepseek-v4-flash)

**Why:** Shared conversations + messages tables; without provider, list/delete/send endpoints would leak across AI providers.
**How to apply:** Every write/delete route on openrouter.ts must check provider.startsWith('openrouter-') before acting. Strict mode validation rejects unknown values instead of defaulting.
