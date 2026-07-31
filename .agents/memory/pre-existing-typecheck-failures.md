---
name: Pre-existing unrelated typecheck failures
description: Known, unrelated typecheck errors in this repo's OpenAI integration libs — don't re-diagnose them as caused by your changes
---

`pnpm run typecheck` (specifically the `typecheck:libs` / `tsc --build` step) fails with errors in `lib/integrations-openai-ai-server` (e.g. `response.data` possibly undefined in the image client) and `lib/integrations-openai-ai-react` (e.g. `Cannot find module 'react'` in audio hooks, an implicit-any param).

**Why:** confirmed via `git stash` that these errors exist independent of any feature work in this repo — they predate current changes and are not caused by edits elsewhere in the monorepo.

**How to apply:** when `pnpm run typecheck` fails, check whether the failures are confined to these two packages/these specific error messages before assuming your change broke something. If new errors appear elsewhere, those are real and need fixing; these specific ones can be ignored/reported as pre-existing.
