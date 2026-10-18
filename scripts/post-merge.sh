#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter @workspace/db run push
pnpm --filter @workspace/scripts run seed
pnpm --filter @workspace/api-server run build
fuser -k 8080/tcp 2>/dev/null || true
