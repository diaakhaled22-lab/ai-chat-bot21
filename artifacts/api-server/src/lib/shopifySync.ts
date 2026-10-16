import { db, pool, companyShopifyIntegrationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { isSafeUrl } from "./security";

// Max total characters of Shopify content injected into the prompt
const MAX_PROMPT_CHARS = 8_000;
// Max items to format to keep knowledge base performant and clean
const MAX_PRODUCTS_TO_FORMAT = 150;

export interface ShopifyCredentials {
  shopDomain: string;
  accessToken?: string | null;
  apiVersion?: string | null;
}

export interface FetchShopifyResult {
  ok: boolean;
  contentCache?: string;
  totalItems?: number;
  shopName?: string;
  shopCurrency?: string;
  samplePreview?: string;
  error?: string;
}

/**
 * Ensures the company_shopify_integrations table exists in PostgreSQL.
 */
export async function ensureShopifySchema(): Promise<void> {
  try {
    if (!pool) return;
    await pool.query(`
      CREATE TABLE IF NOT EXISTS company_shopify_integrations (
        id serial PRIMARY KEY,
        company_id integer NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
        shop_domain text NOT NULL,
        access_token text,
        api_version text NOT NULL DEFAULT '2024-01',
        status text NOT NULL DEFAULT 'pending',
        error_message text,
        auto_sync boolean NOT NULL DEFAULT true,
        last_synced timestamp with time zone,
        content_cache text,
        total_items integer NOT NULL DEFAULT 0,
        shop_name text,
        shop_currency text,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        updated_at timestamp with time zone NOT NULL DEFAULT now()
      );
    `);
    logger.info("Shopify Integration schema ensured successfully");
  } catch (err) {
    logger.error({ err }, "Failed to ensure Shopify Integration schema");
  }
}

/** Normalise shop domain input */
export function normaliseShopDomain(raw: string): string {
  let domain = raw.trim().toLowerCase();
  // Strip http:// or https://
  domain = domain.replace(/^https?:\/\//i, "");
  // Strip trailing slashes or paths
  domain = domain.split("/")[0].trim();

  // If the user entered just the store slug (e.g. "my-brand"), append .myshopify.com
  if (!domain.includes(".")) {
    domain += ".myshopify.com";
  }

  return domain;
}

/** Strip HTML tags and clean up whitespace */
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#\d+;/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Format single Shopify product into readable AI knowledge note */
function formatShopifyProduct(p: any, shopDomain: string, currency?: string): string {
  const parts: string[] = [];
  const title = p.title || "Unnamed Product";
  parts.push(`Product: ${title}`);

  const metaParts: string[] = [];
  if (p.product_type) metaParts.push(`Category: ${p.product_type}`);
  if (p.vendor) metaParts.push(`Brand/Vendor: ${p.vendor}`);
  if (metaParts.length > 0) parts.push(metaParts.join(" | "));

  // Format pricing & variants
  const curr = currency ? ` ${currency}` : "";
  if (Array.isArray(p.variants) && p.variants.length > 0) {
    if (p.variants.length === 1) {
      const v = p.variants[0];
      const priceStr = v.price ? `${v.price}${curr}` : "N/A";
      const available = v.available !== undefined ? (v.available ? "In Stock" : "Out of Stock") : "";
      parts.push(`Price: ${priceStr}${available ? ` (${available})` : ""}`);
      if (v.sku) parts.push(`SKU: ${v.sku}`);
    } else {
      const vList = p.variants.slice(0, 8).map((v: any) => {
        const vTitle = v.title && v.title !== "Default Title" ? ` [${v.title}]` : "";
        const price = v.price ? `: ${v.price}${curr}` : "";
        const avail = v.available !== undefined ? (v.available ? " - In Stock" : " - Out of Stock") : "";
        const sku = v.sku ? ` (SKU: ${v.sku})` : "";
        return `  • Variant${vTitle}${sku}${price}${avail}`;
      });
      parts.push(`Variants & Options:\n${vList.join("\n")}`);
    }
  }

  // Tags
  if (p.tags) {
    const tagsStr = Array.isArray(p.tags) ? p.tags.join(", ") : String(p.tags);
    if (tagsStr.trim()) parts.push(`Tags: ${tagsStr}`);
  }

  // Description / Body
  const rawBody = p.body_html || p.description || "";
  if (rawBody) {
    const cleanBody = stripHtml(rawBody);
    if (cleanBody) {
      parts.push(`Description: ${cleanBody.slice(0, 400)}${cleanBody.length > 400 ? "..." : ""}`);
    }
  }

  // Direct product link if handle exists
  if (p.handle) {
    parts.push(`Link: https://${shopDomain}/products/${p.handle}`);
  }

  return parts.join("\n");
}

/**
 * Fetch products and store details from Shopify
 */
export async function fetchShopifyContent(
  creds: ShopifyCredentials
): Promise<FetchShopifyResult> {
  const shopDomain = normaliseShopDomain(creds.shopDomain);
  const apiVersion = creds.apiVersion?.trim() || "2024-01";
  const accessToken = creds.accessToken?.trim() || null;

  const targetTestUrl = `https://${shopDomain}`;
  if (!isSafeUrl(targetTestUrl)) {
    return {
      ok: false,
      error: "SSRF Protection: The Shopify store URL points to an internal or restricted network address.",
    };
  }

  let shopName: string | undefined;
  let shopCurrency: string | undefined;
  const sections: string[] = [];
  let totalItems = 0;

  // ── Strategy 1: Admin REST API (Preferred if token provided) ─────────────
  if (accessToken) {
    const adminHeaders: Record<string, string> = {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
      "Accept": "application/json",
      "User-Agent": "ChatbotShopifySync/1.0",
    };

    // 1. Fetch shop metadata
    try {
      const shopRes = await fetch(`https://${shopDomain}/admin/api/${apiVersion}/shop.json`, {
        headers: adminHeaders,
        signal: AbortSignal.timeout(10_000),
      });

      if (shopRes.ok) {
        const shopData = (await shopRes.json()) as any;
        if (shopData?.shop) {
          shopName = shopData.shop.name;
          shopCurrency = shopData.shop.currency;
          sections.push(
            `=== Shopify Store Profile ===\nStore: ${shopData.shop.name}\nDomain: ${shopDomain}\nCurrency: ${shopData.shop.currency || "USD"}${shopData.shop.country_name ? `\nCountry: ${shopData.shop.country_name}` : ""}`
          );
        }
      } else if (shopRes.status === 401 || shopRes.status === 403) {
        return {
          ok: false,
          error: "Shopify Authentication failed. Check your Admin API access token (must start with shpat_ and have read_products scope).",
        };
      }
    } catch (err: any) {
      logger.warn({ err: err?.message, shopDomain }, "Shopify admin shop.json fetch failed");
    }

    // 2. Fetch collections / categories
    try {
      const collectionsRes = await fetch(
        `https://${shopDomain}/admin/api/${apiVersion}/custom_collections.json?limit=50`,
        { headers: adminHeaders, signal: AbortSignal.timeout(10_000) }
      );
      if (collectionsRes.ok) {
        const cData = (await collectionsRes.json()) as any;
        const collections: any[] = cData?.custom_collections || [];
        if (collections.length > 0) {
          const cLines = collections
            .map((c) => `- ${c.title}${c.body_html ? `: ${stripHtml(c.body_html).slice(0, 150)}` : ""}`)
            .filter(Boolean);
          if (cLines.length > 0) {
            sections.push(`=== Store Collections / Categories (${collections.length}) ===\n${cLines.join("\n")}`);
          }
        }
      }
    } catch {
      // Collections are optional, proceed
    }

    // 3. Fetch products via Admin API
    try {
      const productsRes = await fetch(
        `https://${shopDomain}/admin/api/${apiVersion}/products.json?limit=250&status=active`,
        { headers: adminHeaders, signal: AbortSignal.timeout(15_000) }
      );

      if (productsRes.ok) {
        const pData = (await productsRes.json()) as any;
        const products: any[] = pData?.products || [];
        totalItems = products.length;

        if (products.length > 0) {
          const formattedProducts = products
            .slice(0, MAX_PRODUCTS_TO_FORMAT)
            .map((p) => formatShopifyProduct(p, shopDomain, shopCurrency));

          sections.push(`=== Products Catalog (${products.length} items) ===\n${formattedProducts.join("\n\n---\n\n")}`);
        }
      } else if (!sections.length) {
        return {
          ok: false,
          error: `Shopify Admin API returned status HTTP ${productsRes.status}.`,
        };
      }
    } catch (err: any) {
      logger.warn({ err: err?.message, shopDomain }, "Shopify admin products.json fetch failed");
    }
  }

  // ── Strategy 2: Public Storefront Products Endpoint ───────────────────────
  // Used if no token was provided, or if Admin API didn't return products
  if (totalItems === 0) {
    try {
      const publicUrl = `https://${shopDomain}/products.json?limit=250`;
      const publicRes = await fetch(publicUrl, {
        headers: {
          "Accept": "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        signal: AbortSignal.timeout(12_000),
      });

      if (publicRes.ok) {
        const data = (await publicRes.json()) as any;
        const products: any[] = data?.products || [];
        totalItems = products.length;

        if (products.length > 0) {
          if (!shopName) shopName = shopDomain.replace(".myshopify.com", "");
          if (sections.length === 0) {
            sections.push(`=== Shopify Store Profile ===\nStore: ${shopName}\nDomain: ${shopDomain}`);
          }

          const formattedProducts = products
            .slice(0, MAX_PRODUCTS_TO_FORMAT)
            .map((p) => formatShopifyProduct(p, shopDomain, shopCurrency));

          sections.push(`=== Products Catalog (${products.length} items) ===\n${formattedProducts.join("\n\n---\n\n")}`);
        }
      }
    } catch (err: any) {
      logger.warn({ err: err?.message, shopDomain }, "Shopify public products.json fetch failed");
    }
  }

  if (sections.length === 0 || totalItems === 0) {
    return {
      ok: false,
      totalItems: 0,
      error:
        "No products found on Shopify. Please verify your store domain, ensure your store is public, or provide an Admin API access token with 'read_products' permissions.",
    };
  }

  let combined = sections.join("\n\n");
  if (combined.length > 60_000) {
    combined = combined.slice(0, 60_000);
  }

  const samplePreview = combined.slice(0, 1800);

  return {
    ok: true,
    totalItems,
    contentCache: combined,
    shopName,
    shopCurrency,
    samplePreview,
  };
}

/** Sync a company's Shopify integration and update database */
export async function syncCompanyShopify(companyId: number): Promise<boolean> {
  const [integration] = await db
    .select()
    .from(companyShopifyIntegrationsTable)
    .where(eq(companyShopifyIntegrationsTable.companyId, companyId))
    .limit(1);

  if (!integration) return false;

  try {
    const result = await fetchShopifyContent({
      shopDomain: integration.shopDomain,
      accessToken: integration.accessToken,
      apiVersion: integration.apiVersion,
    });

    if (!result.ok) {
      await db
        .update(companyShopifyIntegrationsTable)
        .set({
          status: "error",
          errorMessage: result.error || "Failed to fetch content from Shopify",
          updatedAt: new Date(),
        })
        .where(eq(companyShopifyIntegrationsTable.id, integration.id));
      return false;
    }

    await db
      .update(companyShopifyIntegrationsTable)
      .set({
        status: "connected",
        errorMessage: null,
        lastSynced: new Date(),
        contentCache: result.contentCache,
        totalItems: result.totalItems,
        shopName: result.shopName || integration.shopName,
        shopCurrency: result.shopCurrency || integration.shopCurrency,
        updatedAt: new Date(),
      })
      .where(eq(companyShopifyIntegrationsTable.id, integration.id));

    return true;
  } catch (err: any) {
    logger.error({ err, companyId }, "Shopify sync error");
    await db
      .update(companyShopifyIntegrationsTable)
      .set({
        status: "error",
        errorMessage: err?.message || "Unexpected error during Shopify sync",
        updatedAt: new Date(),
      })
      .where(eq(companyShopifyIntegrationsTable.id, integration.id));
    return false;
  }
}

/** Scheduled: sync all companies with Shopify autoSync enabled */
export async function syncAllShopifyIntegrations(): Promise<void> {
  try {
    const integrations = await db
      .select({ companyId: companyShopifyIntegrationsTable.companyId })
      .from(companyShopifyIntegrationsTable)
      .where(eq(companyShopifyIntegrationsTable.autoSync, true));

    if (integrations.length === 0) return;

    logger.info({ count: integrations.length }, "Shopify AutoSync: starting");
    let synced = 0;
    for (const { companyId } of integrations) {
      const ok = await syncCompanyShopify(companyId);
      if (ok) synced++;
    }
    logger.info({ synced, total: integrations.length }, "Shopify AutoSync: complete");
  } catch (err) {
    logger.error({ err }, "Shopify AutoSync: error");
  }
}

/** Returns the Shopify knowledge section for the AI system prompt */
export async function getShopifyKnowledgeSection(companyId: number): Promise<string> {
  try {
    const [integration] = await db
      .select({
        status: companyShopifyIntegrationsTable.status,
        contentCache: companyShopifyIntegrationsTable.contentCache,
        shopDomain: companyShopifyIntegrationsTable.shopDomain,
        shopName: companyShopifyIntegrationsTable.shopName,
      })
      .from(companyShopifyIntegrationsTable)
      .where(eq(companyShopifyIntegrationsTable.companyId, companyId))
      .limit(1);

    if (!integration || integration.status !== "connected" || !integration.contentCache) {
      return "";
    }

    const content = integration.contentCache.slice(0, MAX_PROMPT_CHARS);
    const storeLabel = integration.shopName
      ? `${integration.shopName} (${integration.shopDomain})`
      : integration.shopDomain;

    return `\n\nShopify Store Products & Knowledge (from ${storeLabel}):\n${content}`;
  } catch {
    return "";
  }
}
