import { db, pool, companyRestApiIntegrationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { isSafeUrl } from "./security";

// Max total characters of REST API content injected into the prompt
const MAX_PROMPT_CHARS = 8_000;
// Max items to format from an array to prevent prompt overflow
const MAX_ITEMS_TO_FORMAT = 100;

export interface RestApiCredentials {
  apiUrl: string;
  httpMethod?: string | null;
  headerName?: string | null;
  headerValue?: string | null;
  dataExtractionPath?: string | null;
}

export interface FetchRestApiResult {
  ok: boolean;
  contentCache?: string;
  totalItems?: number;
  samplePreview?: string;
  error?: string;
}

/**
 * Ensures the company_rest_api_integrations table exists in PostgreSQL.
 */
export async function ensureRestApiSchema(): Promise<void> {
  try {
    if (!pool) return;
    await pool.query(`
      CREATE TABLE IF NOT EXISTS company_rest_api_integrations (
        id serial PRIMARY KEY,
        company_id integer NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
        api_url text NOT NULL,
        http_method text NOT NULL DEFAULT 'GET',
        header_name text,
        header_value text,
        data_extraction_path text,
        status text NOT NULL DEFAULT 'pending',
        error_message text,
        auto_sync boolean NOT NULL DEFAULT true,
        last_synced timestamp with time zone,
        content_cache text,
        total_items integer NOT NULL DEFAULT 0,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        updated_at timestamp with time zone NOT NULL DEFAULT now()
      );
    `);
    logger.info("REST API Integration schema ensured successfully");
  } catch (err) {
    logger.error({ err }, "Failed to ensure REST API Integration schema");
  }
}

function humanizeKey(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

/**
 * Converts arbitrary parsed JSON into clean, readable text notes for the AI model.
 */
function jsonToReadableNotes(value: unknown, depth = 0): string {
  const pad = "  ".repeat(depth);

  if (value === null || value === undefined) return "(none)";

  if (typeof value !== "object") {
    return String(value);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return "(empty list)";
    return value
      .slice(0, MAX_ITEMS_TO_FORMAT)
      .map((item, i) => {
        if (item !== null && typeof item === "object") {
          return `${pad}Item ${i + 1}:\n${jsonToReadableNotes(item, depth + 1)}`;
        }
        return `${pad}• ${jsonToReadableNotes(item, depth)}`;
      })
      .join("\n\n");
  }

  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return "(empty)";

  return entries
    .map(([k, v]) => {
      const label = humanizeKey(k);
      if (v !== null && typeof v === "object") {
        if (Array.isArray(v)) {
          return `${pad}${label}:\n${jsonToReadableNotes(v, depth + 1)}`;
        }
        return `${pad}${label}:\n${jsonToReadableNotes(v, depth + 1)}`;
      }
      return `${pad}${label}: ${jsonToReadableNotes(v, depth)}`;
    })
    .join("\n");
}

/**
 * Extracts nested data using dot-notation (e.g. "data.products" or "items")
 * or auto-discovers arrays if no path is given.
 */
function extractTargetData(data: any, path?: string | null): { target: any; count: number } {
  if (!data) return { target: null, count: 0 };

  let current = data;

  if (path && path.trim()) {
    const parts = path.trim().split(".");
    for (const part of parts) {
      if (current && typeof current === "object" && part in current) {
        current = current[part];
      } else {
        // Path not found, return full data
        current = data;
        break;
      }
    }
  } else if (data && typeof data === "object" && !Array.isArray(data)) {
    // Auto-discover common array wrapper keys (data, items, results, products, posts, articles, rows)
    const commonKeys = ["data", "items", "results", "products", "posts", "articles", "records", "rows"];
    for (const key of commonKeys) {
      if (Array.isArray(data[key]) && data[key].length > 0) {
        current = data[key];
        break;
      }
    }
  }

  const count = Array.isArray(current) ? current.length : (current && typeof current === "object" ? Object.keys(current).length : 1);
  return { target: current, count };
}

/**
 * Fetches content from a REST API endpoint and formats it into readable knowledge.
 */
export async function fetchRestApiContent(params: RestApiCredentials): Promise<FetchRestApiResult> {
  const { apiUrl, httpMethod, headerName, headerValue, dataExtractionPath } = params;

  if (!apiUrl || typeof apiUrl !== "string") {
    return { ok: false, error: "API URL is required" };
  }

  const trimmedUrl = apiUrl.trim();

  // SSRF protection
  if (!isSafeUrl(trimmedUrl)) {
    logger.warn({ url: trimmedUrl }, "fetchRestApiContent blocked: URL points to internal address");
    return { ok: false, error: "The provided URL is not allowed (internal or private address)." };
  }

  const headers: Record<string, string> = {
    "User-Agent": "ChatbotRestApiSync/1.0",
    "Accept": "application/json, text/plain, */*",
  };

  if (headerName && headerName.trim() && headerValue && headerValue.trim()) {
    headers[headerName.trim()] = headerValue.trim();
  }

  const method = (httpMethod || "GET").toUpperCase();

  try {
    const res = await fetch(trimmedUrl, {
      method,
      headers,
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      return {
        ok: false,
        error: `HTTP ${res.status}: ${res.statusText || "Request failed"}`,
      };
    }

    const contentType = res.headers.get("content-type") || "";
    let formattedText = "";
    let totalItems = 0;

    if (contentType.includes("json")) {
      const json = await res.json();
      const { target, count } = extractTargetData(json, dataExtractionPath);
      totalItems = count;
      formattedText = jsonToReadableNotes(target);
    } else {
      const rawText = await res.text();
      // Clean HTML tags if API returned HTML
      const cleaned = rawText
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim();
      formattedText = cleaned;
      totalItems = 1;
    }

    if (!formattedText || !formattedText.trim()) {
      return { ok: false, error: "API returned an empty response or no data could be extracted." };
    }

    const samplePreview = formattedText.slice(0, 1000);

    return {
      ok: true,
      contentCache: formattedText.slice(0, 500_000), // Store up to 500k characters in DB
      totalItems,
      samplePreview,
    };
  } catch (err: any) {
    logger.warn({ err, apiUrl: trimmedUrl }, "REST API fetch failed");
    return {
      ok: false,
      error: err?.message || "Failed to connect to the REST API endpoint.",
    };
  }
}

/**
 * Synchronizes the REST API integration for a single company.
 */
export async function syncCompanyRestApi(companyId: number): Promise<boolean> {
  try {
    const [integration] = await db
      .select()
      .from(companyRestApiIntegrationsTable)
      .where(eq(companyRestApiIntegrationsTable.companyId, companyId))
      .limit(1);

    if (!integration) return false;

    const result = await fetchRestApiContent({
      apiUrl: integration.apiUrl,
      httpMethod: integration.httpMethod,
      headerName: integration.headerName,
      headerValue: integration.headerValue,
      dataExtractionPath: integration.dataExtractionPath,
    });

    if (!result.ok) {
      await db
        .update(companyRestApiIntegrationsTable)
        .set({
          status: "error",
          errorMessage: result.error ?? "Sync failed",
        })
        .where(eq(companyRestApiIntegrationsTable.id, integration.id));
      return false;
    }

    await db
      .update(companyRestApiIntegrationsTable)
      .set({
        status: "connected",
        errorMessage: null,
        lastSynced: new Date(),
        contentCache: result.contentCache,
        totalItems: result.totalItems ?? 0,
      })
      .where(eq(companyRestApiIntegrationsTable.id, integration.id));

    return true;
  } catch (err) {
    logger.error({ err, companyId }, "REST API sync error");
    return false;
  }
}

/**
 * Scheduled job: Sync all companies with autoSync enabled.
 */
export async function syncAllRestApiIntegrations(): Promise<void> {
  try {
    const integrations = await db
      .select({ companyId: companyRestApiIntegrationsTable.companyId })
      .from(companyRestApiIntegrationsTable)
      .where(eq(companyRestApiIntegrationsTable.autoSync, true));

    if (integrations.length === 0) return;

    logger.info({ count: integrations.length }, "REST API AutoSync: starting");
    let synced = 0;
    for (const { companyId } of integrations) {
      const ok = await syncCompanyRestApi(companyId);
      if (ok) synced++;
    }
    logger.info({ synced, total: integrations.length }, "REST API AutoSync: complete");
  } catch (err) {
    logger.error({ err }, "REST API AutoSync: error");
  }
}

/**
 * Returns the REST API knowledge section for the AI system prompt.
 */
export async function getRestApiKnowledgeSection(companyId: number): Promise<string> {
  try {
    const [integration] = await db
      .select({
        status: companyRestApiIntegrationsTable.status,
        contentCache: companyRestApiIntegrationsTable.contentCache,
        apiUrl: companyRestApiIntegrationsTable.apiUrl,
      })
      .from(companyRestApiIntegrationsTable)
      .where(eq(companyRestApiIntegrationsTable.companyId, companyId))
      .limit(1);

    if (!integration || integration.status !== "connected" || !integration.contentCache) {
      return "";
    }

    const content = integration.contentCache.slice(0, MAX_PROMPT_CHARS);
    return `\n\nREST API Knowledge Base (from ${integration.apiUrl}):\n${content}`;
  } catch {
    return "";
  }
}
