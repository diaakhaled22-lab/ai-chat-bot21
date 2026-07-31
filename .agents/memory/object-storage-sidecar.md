---
name: Object Storage sidecar limitation
description: Replit Object Storage sidecar at 127.0.0.1:1106 returns 401 "no allowed resources" in agent/dev sessions; GCS SDK auth also fails. Knowledge file uploads bypass GCS entirely.
---

## Rule
Do NOT use the Replit Object Storage sidecar (`http://127.0.0.1:1106`) for knowledge file uploads. Both the presigned-URL endpoint (`/object-storage/signed-object-url`) and the token exchange endpoint (`/token`) return 401 "no allowed resources" in agent and workflow sessions.

**Why:** The sidecar requires the container to start with `DEFAULT_OBJECT_STORAGE_BUCKET_ID` already set in the environment. In this project, the secret was added after the container started, so the sidecar is unaware of the bucket. A full workspace restart (not just workflow restart) would allow the sidecar to pick up the bucket — but even then, agent sessions may have reduced permissions.

**How to apply:**
- Knowledge file uploads use `POST /api/client/company/knowledge-files/upload` (multer multipart route in `knowledgeFiles.ts`).
- The route reads the buffer in memory, calls `extractTextFromBuffer()` directly, and saves the record with `status: "ready"` and `extractedText` set — no GCS required.
- `objectPath` is left null for files uploaded via this route.
- Google Sheet links still use the original `createClientKnowledgeFile` mutation (no file content involved).
- The `storage.ts` route and `use-upload.ts` hook still exist in the codebase but are not used by the knowledge files flow.
- If Object Storage is needed for other use cases (public asset serving), the user must restart the full Replit workspace after confirming `DEFAULT_OBJECT_STORAGE_BUCKET_ID` is set so the sidecar picks it up.
