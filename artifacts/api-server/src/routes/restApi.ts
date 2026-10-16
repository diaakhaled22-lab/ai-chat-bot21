import { Router } from "express";
import { db, companyRestApiIntegrationsTable, companiesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireClient } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";
import {
  fetchRestApiContent,
  syncCompanyRestApi,
} from "../lib/restApiSync";

const router = Router();

router.use("/client/rest-api", requireClient);

/** Get the company for the session user */
async function getCompany(userId: number) {
  const [company] = await db
    .select({ id: companiesTable.id, allowSourceRestApi: companiesTable.allowSourceRestApi })
    .from(companiesTable)
    .where(eq(companiesTable.clientId, userId))
    .limit(1);
  return company ?? null;
}

function serializeIntegration(row: typeof companyRestApiIntegrationsTable.$inferSelect) {
  return {
    id: row.id,
    companyId: row.companyId,
    apiUrl: row.apiUrl,
    httpMethod: row.httpMethod,
    headerName: row.headerName,
    hasHeaderValue: !!row.headerValue,
    dataExtractionPath: row.dataExtractionPath,
    status: row.status,
    errorMessage: row.errorMessage,
    autoSync: row.autoSync,
    lastSynced: row.lastSynced?.toISOString() ?? null,
    totalItems: row.totalItems,
    samplePreview: row.contentCache ? row.contentCache.slice(0, 1500) : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// GET /client/rest-api — return current integration (or null)
router.get("/client/rest-api", async (req, res) => {
  try {
    const company = await getCompany(req.session.userId!);
    if (!company) {
      res.json(null);
      return;
    }
    const [row] = await db
      .select()
      .from(companyRestApiIntegrationsTable)
      .where(eq(companyRestApiIntegrationsTable.companyId, company.id))
      .limit(1);
    res.json(row ? serializeIntegration(row) : null);
  } catch (err) {
    logger.error({ err }, "GET /client/rest-api error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /client/rest-api/test — test connection and preview extracted data WITHOUT saving
router.post("/client/rest-api/test", async (req, res) => {
  try {
    const { apiUrl, httpMethod, headerName, headerValue, dataExtractionPath } = req.body as {
      apiUrl?: string;
      httpMethod?: string;
      headerName?: string;
      headerValue?: string;
      dataExtractionPath?: string;
    };

    if (!apiUrl || typeof apiUrl !== "string") {
      res.status(400).json({ ok: false, error: "apiUrl is required" });
      return;
    }

    const result = await fetchRestApiContent({
      apiUrl,
      httpMethod,
      headerName,
      headerValue,
      dataExtractionPath,
    });

    res.json(result);
  } catch (err) {
    logger.error({ err }, "POST /client/rest-api/test error");
    res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

// PUT /client/rest-api — save or update integration, then kick off sync
router.put("/client/rest-api", async (req, res) => {
  try {
    const company = await getCompany(req.session.userId!);
    if (!company) {
      res.status(400).json({ error: "Configure your company profile first" });
      return;
    }

    if (company.allowSourceRestApi === false) {
      res.status(403).json({ error: "REST API data source is disabled by administrator." });
      return;
    }
    const companyId = company.id;

    const { apiUrl, httpMethod, headerName, headerValue, dataExtractionPath, autoSync } = req.body as {
      apiUrl?: string;
      httpMethod?: string;
      headerName?: string;
      headerValue?: string;
      dataExtractionPath?: string;
      autoSync?: boolean;
    };

    if (!apiUrl || typeof apiUrl !== "string" || !apiUrl.trim()) {
      res.status(400).json({ error: "API URL is required" });
      return;
    }

    const trimmedUrl = apiUrl.trim();

    // Check existing record to preserve headerValue if not supplied on edit
    const [existing] = await db
      .select()
      .from(companyRestApiIntegrationsTable)
      .where(eq(companyRestApiIntegrationsTable.companyId, companyId))
      .limit(1);

    const effectiveHeaderValue =
      headerValue !== undefined && headerValue !== ""
        ? headerValue.trim()
        : (existing?.headerValue ?? null);

    const values = {
      companyId,
      apiUrl: trimmedUrl,
      httpMethod: (httpMethod || "GET").toUpperCase(),
      headerName: headerName?.trim() || null,
      headerValue: effectiveHeaderValue,
      dataExtractionPath: dataExtractionPath?.trim() || null,
      autoSync: autoSync !== undefined ? Boolean(autoSync) : true,
      status: "pending" as const,
      errorMessage: null,
    };

    let integrationId: number;

    if (existing) {
      await db
        .update(companyRestApiIntegrationsTable)
        .set(values)
        .where(eq(companyRestApiIntegrationsTable.id, existing.id));
      integrationId = existing.id;
    } else {
      const [inserted] = await db
        .insert(companyRestApiIntegrationsTable)
        .values(values)
        .returning({ id: companyRestApiIntegrationsTable.id });
      integrationId = inserted.id;
    }

    // Trigger immediate background sync
    void syncCompanyRestApi(companyId);

    const [saved] = await db
      .select()
      .from(companyRestApiIntegrationsTable)
      .where(eq(companyRestApiIntegrationsTable.id, integrationId))
      .limit(1);

    res.json(saved ? serializeIntegration(saved) : null);
  } catch (err) {
    logger.error({ err }, "PUT /client/rest-api error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /client/rest-api/sync — manual sync trigger
router.post("/client/rest-api/sync", async (req, res) => {
  try {
    const company = await getCompany(req.session.userId!);
    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }

    if (company.allowSourceRestApi === false) {
      res.status(403).json({ error: "REST API data source is disabled by administrator." });
      return;
    }
    const companyId = company.id;

    const ok = await syncCompanyRestApi(companyId);

    const [integration] = await db
      .select()
      .from(companyRestApiIntegrationsTable)
      .where(eq(companyRestApiIntegrationsTable.companyId, companyId))
      .limit(1);

    res.json({
      ok,
      integration: integration ? serializeIntegration(integration) : null,
    });
  } catch (err) {
    logger.error({ err }, "POST /client/rest-api/sync error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /client/rest-api — remove integration
router.delete("/client/rest-api", async (req, res) => {
  try {
    const company = await getCompany(req.session.userId!);
    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }
    const companyId = company.id;

    await db
      .delete(companyRestApiIntegrationsTable)
      .where(eq(companyRestApiIntegrationsTable.companyId, companyId));

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "DELETE /client/rest-api error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
