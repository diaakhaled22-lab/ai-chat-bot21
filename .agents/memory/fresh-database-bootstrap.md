---
name: Fresh database bootstrap
description: The setup steps needed when this imported app starts with an empty development database
---

An imported development database may be reachable but empty. Setup requires applying the existing Drizzle schema and explicitly creating the documented administrator account before the login flow can be smoke-tested.

**Why:** The API starts successfully against an empty database, but scheduled jobs fail on missing tables and the documented admin credentials cannot work when the users table has no rows.

**How to apply:** During fresh Replit setup, run the existing database push command, check the expected tables, and seed only the credentials already documented by the project. A repeatable seed command would remove the remaining manual step.