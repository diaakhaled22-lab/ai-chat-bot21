# Bot Manager – AI Chatbot Platform

An AI chatbot management platform for deploying and managing AI-powered chat widgets for client companies.

## Stack

- **Frontend**: React 19 + Vite + Tailwind CSS v4 + Radix UI (`artifacts/chatbot-admin`)
- **Backend**: Express 5 + TypeScript (`artifacts/api-server`)
- **Database**: PostgreSQL + Drizzle ORM (`lib/db`)
- **AI integrations**: OpenAI, Anthropic, Google Gemini, OpenRouter (`lib/integrations`)
- **Monorepo**: pnpm workspaces

## Running the project

Both workflows start automatically:

| Workflow | Command |
|---|---|
| `artifacts/api-server: API Server` | `pnpm --filter @workspace/api-server run dev` |
| `artifacts/chatbot-admin: web` | `pnpm --filter @workspace/chatbot-admin run dev` |

Install dependencies (first time or after pulling new packages):

```bash
pnpm install
```

Push the database schema:

```bash
pnpm --filter @workspace/db run push
```

## Admin account setup

Set `DEFAULT_ADMIN_PASSWORD` to a unique password of at least 16 characters before starting the API in production. The API does not provide default admin credentials. If the historical `admin/admin123` credential exists in the database, startup rotates it; configure a new strong password and complete recovery through your trusted database administration process.

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | Auto-provisioned by Replit |
| `SESSION_SECRET` | Yes | Set as a Replit Secret |
| `DEFAULT_ADMIN_PASSWORD` | Yes, for initial production admin setup | Unique password, at least 16 characters; never use `admin123` |
| `TOTP_ENCRYPTION_KEY` | Required to store or verify TOTP secrets | Stable secret of at least 32 bytes; changing it requires TOTP re-enrollment |

TOTP secrets use authenticated encryption. Existing plaintext or unauthenticated CBC secrets are rejected and require secure re-enrollment; they are never treated as plaintext when decryption fails.
| `OPENAI_API_KEY` | For OpenAI AI features | Set as a Replit Secret |
| `PORT` | Yes | Auto-set by Replit per artifact |

## User preferences

- Keep existing monorepo structure and stack.
