import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import test from "node:test";
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { db, pool, usersTable, type User } from "@workspace/db";
import app from "./app";
import { ensureAdminExists } from "./lib/adminBootstrap";

const configuredPassword = "bootstrap-test-password";

test("recreates the admin account with DEFAULT_ADMIN_PASSWORD and allows login", async () => {
  const previousPassword = process.env.DEFAULT_ADMIN_PASSWORD;
  const [previousAdmin] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.username, "admin"))
    .limit(1);
  let server: Server | undefined;

  try {
    process.env.DEFAULT_ADMIN_PASSWORD = configuredPassword;
    await db.delete(usersTable).where(eq(usersTable.username, "admin"));

    await ensureAdminExists();

    const [createdAdmin] = await db
      .select()
      .from(usersTable)
      .where(and(eq(usersTable.username, "admin"), eq(usersTable.role, "admin")))
      .limit(1);

    assert.ok(createdAdmin, "bootstrap should recreate the admin user");
    assert.equal(createdAdmin.name, "Admin");
    assert.equal(
      await bcrypt.compare(configuredPassword, createdAdmin.passwordHash),
      true,
      "bootstrap should hash DEFAULT_ADMIN_PASSWORD",
    );

    server = app.listen(0);
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");

    const response = await fetch(`http://127.0.0.1:${address.port}/api/auth/admin/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "admin", password: configuredPassword }),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      role: "admin",
      name: "Admin",
      id: createdAdmin.id,
    });
  } finally {
    if (server) {
      const runningServer = server;
      runningServer.closeAllConnections();
      await new Promise<void>((resolve, reject) => {
        runningServer.close((error) => (error ? reject(error) : resolve()));
      });
    }

    await db.delete(usersTable).where(eq(usersTable.username, "admin"));
    if (previousAdmin) {
      await db.insert(usersTable).values(previousAdmin as User);
    }

    if (previousPassword === undefined) {
      delete process.env.DEFAULT_ADMIN_PASSWORD;
    } else {
      process.env.DEFAULT_ADMIN_PASSWORD = previousPassword;
    }

    await pool.end();
  }
});