---
name: pnpm object-storage-web wiring
description: Gotcha when adding the object-storage-web template package and pnpm overrides for React version alignment
---

The object-storage skill's `lib/object-storage-web` template needs a workspace-root `pnpm.overrides` pinning `react`/`react-dom` so Uppy v5's React peer dep resolves to the same React instance as the rest of the app (avoids duplicate-React/hook errors).

**Why:** `pnpm.overrides` supports a `"$react"` reference syntax that reads the version from a *direct dependency of the same package.json*. The workspace root `package.json` has no direct `react` dependency (only artifacts do, via the pnpm catalog) — using `"$react"` there fails with "Cannot resolve version $react in overrides."

**How to apply:** when adding root-level overrides for a package not directly depended on at the root, use the literal version string (e.g. pull the pinned version from `pnpm-workspace.yaml`'s catalog) instead of the `$name` reference syntax.
