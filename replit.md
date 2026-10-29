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

## Admin account

On first start, if no `admin` user exists, one is created with the password from
`DEFAULT_ADMIN_PASSWORD`. If that variable is not set (development only), a random
password is generated and **not** displayed — set `DEFAULT_ADMIN_PASSWORD` or reset
the password from the database. In production `DEFAULT_ADMIN_PASSWORD` is required.

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | Auto-provisioned by Replit |
| `SESSION_SECRET` | Yes | Set as a Replit Secret |
| `ENCRYPTION_KEY` | Yes (production) | 64 hex chars (32 bytes). Encrypts stored API keys |
| `ALLOWED_ORIGINS` | Yes (production) | Comma-separated frontend origins allowed to send cookies |
| `DEFAULT_ADMIN_PASSWORD` | Yes (production) | Initial admin password |
| `OPENAI_API_KEY` | For OpenAI AI features | Set as a Replit Secret |
| `PORT` | Yes | Auto-set by Replit per artifact |

## User preferences

- Keep existing monorepo structure and stack.

