# Security Review: Admin Credentials and TOTP Secrets

## Findings

| Severity | Finding | Status |
|---|---|---|
| High | `replit.md` documented the shared `admin/admin123` credential. Existing databases could still contain an admin password matching it, even though no current seed should intentionally use it. | Removed the published credential, blocked this password at login, and added startup rotation for admin hashes that match it. Weak `DEFAULT_ADMIN_PASSWORD` values are rejected. |
| Medium | TOTP secrets used unauthenticated AES-CBC and fell back to plaintext when no encryption key was available. Legacy values could also be treated as plaintext when decryption failed. | TOTP storage now uses AES-256-GCM and requires `TOTP_ENCRYPTION_KEY` (at least 32 bytes). Legacy or unauthenticated values fail closed and require secure re-enrollment. |

## Operational notes

- Set a unique `DEFAULT_ADMIN_PASSWORD` of at least 16 characters for production setup. If startup finds an admin account whose password matches the published weak credential, it rotates that password to the configured value or an undisclosed random value. If a random value is used, restore access through the trusted database administration process.
- Set a stable `TOTP_ENCRYPTION_KEY` before enabling TOTP. Existing plaintext/CBC TOTP entries are not migrated automatically; affected accounts must re-enroll. Changing the key also requires re-enrollment.
- The deployed database was not queried as part of this review. Startup now checks every admin account and rotates a matching hash, and login rejects the weak password regardless.

## Verification

- API server TypeScript check passed.
- TOTP encryption tests passed, including ciphertext tampering, unsupported legacy formats, and missing-key behavior.
- Database seed script TypeScript check passed.
- API production bundle build passed.
