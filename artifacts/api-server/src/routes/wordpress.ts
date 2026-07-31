import { Router } from "express";
import { db, companyWordPressIntegrationsTable, companiesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireClient } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";
import {
  validateWordPressUrl,
  fetchWordPressContent,
  syncCompanyWordPress,
  normaliseApiUrl,
} from "../lib/wordpressSync";

const router = Router();

router.use("/client/wordpress", requireClient);

/** Get the company ID for the session user */
async function getCompanyId(userId: number): Promise<number | null> {
  const [company] = await db
    .select({ id: companiesTable.id })
    .from(companiesTable)
    .where(eq(companiesTable.clientId, userId))
    .limit(1);
  return company?.id ?? null;
}

function serializeIntegration(row: typeof companyWordPressIntegrationsTable.$inferSelect) {
  return {
    id: row.id,
    companyId: row.companyId,
    apiUrl: row.apiUrl,
    username: row.username,
    // Never expose the actual password — return a masked sentinel
    hasAppPassword: !!row.appPassword,
    status: row.status,
    errorMessage: row.errorMessage,
    autoSync: row.autoSync,
    lastSynced: row.lastSynced?.toISOString() ?? null,
    totalItems: row.totalItems,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// GET /client/wordpress — return current integration (or null)
router.get("/client/wordpress", async (req, res) => {
  try {
    const companyId = await getCompanyId(req.session.userId!);
    if (!companyId) {
      res.json(null);
      return;
    }
    const [row] = await db
      .select()
      .from(companyWordPressIntegrationsTable)
      .where(eq(companyWordPressIntegrationsTable.companyId, companyId))
      .limit(1);
    res.json(row ? serializeIntegration(row) : null);
  } catch (err) {
    logger.error({ err }, "GET /client/wordpress error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /client/wordpress/test — validate connection WITHOUT saving
router.post("/client/wordpress/test", async (req, res) => {
  try {
    const { apiUrl, username, appPassword } = req.body as {
      apiUrl?: string;
      username?: string;
      appPassword?: string;
    };

    if (!apiUrl || typeof apiUrl !== "string") {
      res.status(400).json({ ok: false, error: "apiUrl is required" });
      return;
    }

    const result = await validateWordPressUrl(apiUrl, { username, appPassword });
    res.json(result);
  } catch (err) {
    logger.error({ err }, "POST /client/wordpress/test error");
    res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

// PUT /client/wordpress — create or update integration, then sync immediately
router.put("/client/wordpress", async (req, res) => {
  try {
    const companyId = await getCompanyId(req.session.userId!);
    if (!companyId) {
      res.status(400).json({ error: "Configure your company profile first" });
      return;
    }

    const { apiUrl, username, appPassword, autoSync } = req.body as {
      apiUrl?: string;
      username?: string;
      appPassword?: string;
      autoSync?: boolean;
    };

    if (!apiUrl || typeof apiUrl !== "string") {
      res.status(400).json({ error: "apiUrl is required" });
      return;
    }

    const normalisedUrl = normaliseApiUrl(apiUrl);

    // First validate the connection
    const validation = await validateWordPressUrl(normalisedUrl, { username, appPassword });
    if (!validation.ok) {
      res.status(422).json({ error: validation.error });
      return;
    }

    // Check for existing row
    const [existing] = await db
      .select({ id: companyWordPressIntegrationsTable.id, appPassword: companyWordPressIntegrationsTable.appPassword })
      .from(companyWordPressIntegrationsTable)
      .where(eq(companyWordPressIntegrationsTable.companyId, companyId))
      .limit(1);

    // Keep old password if not provided (empty string = clear, undefined = keep)
    const resolvedPassword =
      appPassword !== undefined
        ? appPassword || null          // "" clears the password
        : existing?.appPassword ?? null;  // not sent → keep existing

    const values = {
      apiUrl: normalisedUrl,
      username: username || null,
      appPassword: resolvedPassword,
      autoSync: autoSync ?? true,
      status: "pending" as const,
      errorMessage: null,
    };

    let row: typeof companyWordPressIntegrationsTable.$inferSelect;

    if (existing) {
      [row] = await db
        .update(companyWordPressIntegrationsTable)
        .set(values)
        .where(eq(companyWordPressIntegrationsTable.id, existing.id))
        .returning();
    } else {
      [row] = await db
        .insert(companyWordPressIntegrationsTable)
        .values({ companyId, ...values })
        .returning();
    }

    // Kick off a background sync immediately
    void syncCompanyWordPress(companyId);

    res.json(serializeIntegration(row));
  } catch (err) {
    logger.error({ err }, "PUT /client/wordpress error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /client/wordpress/sync — manual sync trigger
router.post("/client/wordpress/sync", async (req, res) => {
  try {
    const companyId = await getCompanyId(req.session.userId!);
    if (!companyId) {
      res.status(404).json({ error: "No company found" });
      return;
    }

    const [existing] = await db
      .select()
      .from(companyWordPressIntegrationsTable)
      .where(eq(companyWordPressIntegrationsTable.companyId, companyId))
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: "No WordPress integration configured" });
      return;
    }

    const ok = await syncCompanyWordPress(companyId);

    const [updated] = await db
      .select()
      .from(companyWordPressIntegrationsTable)
      .where(eq(companyWordPressIntegrationsTable.companyId, companyId))
      .limit(1);

    res.json({ ok, integration: updated ? serializeIntegration(updated) : null });
  } catch (err) {
    logger.error({ err }, "POST /client/wordpress/sync error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /client/wordpress — remove integration
router.delete("/client/wordpress", async (req, res) => {
  try {
    const companyId = await getCompanyId(req.session.userId!);
    if (!companyId) {
      res.status(404).json({ error: "No company found" });
      return;
    }

    await db
      .delete(companyWordPressIntegrationsTable)
      .where(eq(companyWordPressIntegrationsTable.companyId, companyId));

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "DELETE /client/wordpress error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
