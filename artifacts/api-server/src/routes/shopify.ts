import { Router } from "express";
import { db, companyShopifyIntegrationsTable, companiesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireClient } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";
import {
  fetchShopifyContent,
  syncCompanyShopify,
  normaliseShopDomain,
} from "../lib/shopifySync";

const router = Router();

router.use("/client/shopify", requireClient);

/** Get the company for the session user */
async function getCompany(userId: number) {
  const [company] = await db
    .select({ id: companiesTable.id, allowSourceShopify: companiesTable.allowSourceShopify })
    .from(companiesTable)
    .where(eq(companiesTable.clientId, userId))
    .limit(1);
  return company ?? null;
}

function serializeIntegration(row: typeof companyShopifyIntegrationsTable.$inferSelect) {
  return {
    id: row.id,
    companyId: row.companyId,
    shopDomain: row.shopDomain,
    hasAccessToken: !!row.accessToken,
    apiVersion: row.apiVersion,
    status: row.status,
    errorMessage: row.errorMessage,
    autoSync: row.autoSync,
    lastSynced: row.lastSynced?.toISOString() ?? null,
    totalItems: row.totalItems,
    shopName: row.shopName,
    shopCurrency: row.shopCurrency,
    samplePreview: row.contentCache ? row.contentCache.slice(0, 1500) : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// GET /client/shopify — return current integration (or null)
router.get("/client/shopify", async (req, res) => {
  try {
    const company = await getCompany(req.session.userId!);
    if (!company) {
      res.json(null);
      return;
    }
    const [row] = await db
      .select()
      .from(companyShopifyIntegrationsTable)
      .where(eq(companyShopifyIntegrationsTable.companyId, company.id))
      .limit(1);
    res.json(row ? serializeIntegration(row) : null);
  } catch (err) {
    logger.error({ err }, "GET /client/shopify error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /client/shopify/test — test connection and preview extracted products WITHOUT saving
router.post("/client/shopify/test", async (req, res) => {
  try {
    const { shopDomain, accessToken, apiVersion } = req.body as {
      shopDomain?: string;
      accessToken?: string;
      apiVersion?: string;
    };

    if (!shopDomain || typeof shopDomain !== "string" || !shopDomain.trim()) {
      res.status(400).json({ ok: false, error: "Shop domain is required" });
      return;
    }

    const result = await fetchShopifyContent({
      shopDomain: shopDomain.trim(),
      accessToken: accessToken?.trim() || undefined,
      apiVersion: apiVersion?.trim() || undefined,
    });

    res.json(result);
  } catch (err) {
    logger.error({ err }, "POST /client/shopify/test error");
    res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

// PUT /client/shopify — save or update integration, then kick off sync
router.put("/client/shopify", async (req, res) => {
  try {
    const company = await getCompany(req.session.userId!);
    if (!company) {
      res.status(400).json({ error: "Configure your company profile first" });
      return;
    }

    if (company.allowSourceShopify === false) {
      res.status(403).json({ error: "Shopify data source is disabled by administrator." });
      return;
    }
    const companyId = company.id;

    const { shopDomain, accessToken, apiVersion, autoSync } = req.body as {
      shopDomain?: string;
      accessToken?: string;
      apiVersion?: string;
      autoSync?: boolean;
    };

    if (!shopDomain || typeof shopDomain !== "string" || !shopDomain.trim()) {
      res.status(400).json({ error: "Shop domain is required" });
      return;
    }

    const cleanDomain = normaliseShopDomain(shopDomain);

    // Check existing record to preserve accessToken if not supplied on edit
    const [existing] = await db
      .select()
      .from(companyShopifyIntegrationsTable)
      .where(eq(companyShopifyIntegrationsTable.companyId, companyId))
      .limit(1);

    const effectiveToken =
      accessToken !== undefined && accessToken !== ""
        ? accessToken.trim()
        : (existing?.accessToken ?? null);

    const values = {
      companyId,
      shopDomain: cleanDomain,
      accessToken: effectiveToken,
      apiVersion: apiVersion?.trim() || "2024-01",
      autoSync: autoSync !== undefined ? Boolean(autoSync) : true,
      status: "pending" as const,
      errorMessage: null,
    };

    let integrationId: number;

    if (existing) {
      await db
        .update(companyShopifyIntegrationsTable)
        .set(values)
        .where(eq(companyShopifyIntegrationsTable.id, existing.id));
      integrationId = existing.id;
    } else {
      const [inserted] = await db
        .insert(companyShopifyIntegrationsTable)
        .values(values)
        .returning({ id: companyShopifyIntegrationsTable.id });
      integrationId = inserted.id;
    }

    // Trigger immediate background sync
    void syncCompanyShopify(companyId);

    const [saved] = await db
      .select()
      .from(companyShopifyIntegrationsTable)
      .where(eq(companyShopifyIntegrationsTable.id, integrationId))
      .limit(1);

    res.json(saved ? serializeIntegration(saved) : null);
  } catch (err) {
    logger.error({ err }, "PUT /client/shopify error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /client/shopify/sync — manual sync trigger
router.post("/client/shopify/sync", async (req, res) => {
  try {
    const company = await getCompany(req.session.userId!);
    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }

    if (company.allowSourceShopify === false) {
      res.status(403).json({ error: "Shopify data source is disabled by administrator." });
      return;
    }
    const companyId = company.id;

    const ok = await syncCompanyShopify(companyId);

    const [integration] = await db
      .select()
      .from(companyShopifyIntegrationsTable)
      .where(eq(companyShopifyIntegrationsTable.companyId, companyId))
      .limit(1);

    res.json({
      ok,
      integration: integration ? serializeIntegration(integration) : null,
    });
  } catch (err) {
    logger.error({ err }, "POST /client/shopify/sync error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /client/shopify — remove integration
router.delete("/client/shopify", async (req, res) => {
  try {
    const company = await getCompany(req.session.userId!);
    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }
    const companyId = company.id;

    await db
      .delete(companyShopifyIntegrationsTable)
      .where(eq(companyShopifyIntegrationsTable.companyId, companyId));

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "DELETE /client/shopify error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
