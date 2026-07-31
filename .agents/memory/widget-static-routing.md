---
name: api-server static assets need /api prefix
description: Why widget.js (and any static file served by the api-server artifact) must be mounted under /api, not root.
---

In this project, the api-server artifact is only reachable through the shared proxy under the `/api` path prefix (see its `artifact.toml` `paths = ["/api"]`), and the proxy does NOT strip that prefix before forwarding to the service. Express routes in `routes/index.ts` are mounted correctly (`app.use("/api", router)`), but `express.static` for the `public/` folder (serving `widget.js`) was originally mounted at root, so it only matched requests without the `/api` prefix. Through the real proxy, `/api/widget.js` requests fell through to whatever handled `/` (in this case the chatbot-admin SPA's dev server, returning its index.html with a 200 — a silent failure, not a 404).

**Why:** Any new static asset or public file served from the api-server must be mounted the same way as its API routes (`app.use("/api", express.static(...))`), or it will silently 404/misroute in the proxied dev environment despite working when curled directly against the service's own port.

**How to apply:** When adding static files or public assets to `artifacts/api-server`, always test them through the shared proxy (port 80 / `$REPLIT_DEV_DOMAIN`) with the artifact's full path prefix, not just by hitting the service's own port directly — the two can disagree.
