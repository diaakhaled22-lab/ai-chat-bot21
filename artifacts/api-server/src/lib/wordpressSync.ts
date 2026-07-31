import { db, companyWordPressIntegrationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

// Max chars per content item injected into prompt
const MAX_ITEM_CHARS = 800;
// Max total WordPress content in the AI prompt section
const MAX_PROMPT_CHARS = 8_000;
// Max items to fetch per endpoint
const MAX_ITEMS_PER_TYPE = 50;

export interface WpCredentials {
  apiUrl: string;
  username?: string | null;
  appPassword?: string | null;
}

function buildHeaders(creds: WpCredentials): HeadersInit {
  const headers: HeadersInit = {
    "User-Agent": "ChatbotWordPressSync/1.0",
    "Accept": "application/json",
  };
  if (creds.username && creds.appPassword) {
    const token = Buffer.from(`${creds.username}:${creds.appPassword}`).toString("base64");
    headers["Authorization"] = `Basic ${token}`;
  }
  return headers;
}

/** Normalise the base URL: strip trailing slash, ensure /wp-json is present */
export function normaliseApiUrl(raw: string): string {
  let url = raw.trim().replace(/\/+$/, "");
  if (!url.includes("/wp-json")) url += "/wp-json";
  return url;
}

/** Strip HTML tags and collapse whitespace */
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

async function wpFetch<T>(
  base: string,
  path: string,
  creds: WpCredentials,
  params: Record<string, string | number> = {}
): Promise<T | null> {
  try {
    const url = new URL(`${base}${path}`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
    const res = await fetch(url.toString(), {
      headers: buildHeaders(creds),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

interface WpPost {
  id: number;
  title?: { rendered: string };
  content?: { rendered: string };
  excerpt?: { rendered: string };
  name?: string;
  description?: string;
  link?: string;
  slug?: string;
}

interface WpType {
  slug: string;
  name: string;
  rest_base: string;
}

/** Validate that the URL is a reachable WordPress REST API */
export async function validateWordPressUrl(
  rawUrl: string,
  creds?: Omit<WpCredentials, "apiUrl">
): Promise<{ ok: boolean; error?: string; siteName?: string }> {
  const base = normaliseApiUrl(rawUrl);
  const fullCreds: WpCredentials = { apiUrl: base, ...creds };

  try {
    const res = await fetch(`${base}/wp/v2/`, {
      headers: buildHeaders(fullCreds),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        return { ok: false, error: "Authentication failed. Check your username and application password." };
      }
      return { ok: false, error: `Server returned HTTP ${res.status}` };
    }
    const root = await res.json() as Record<string, unknown>;
    // Try to get site name from root endpoint
    let siteName: string | undefined;
    try {
      const rootRes = await fetch(base, {
        headers: buildHeaders(fullCreds),
        signal: AbortSignal.timeout(8_000),
      });
      if (rootRes.ok) {
        const rootData = await rootRes.json() as any;
        siteName = rootData?.name ?? undefined;
      }
    } catch { /* ignore */ }

    return { ok: true, siteName };
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      return { ok: false, error: "Connection timed out. Check the URL is reachable." };
    }
    return { ok: false, error: "Could not reach the WordPress REST API. Verify the URL." };
  }
}

interface SyncResult {
  ok: boolean;
  totalItems: number;
  contentCache: string;
  error?: string;
}

/** Fetch all supported content types and build a combined text cache */
export async function fetchWordPressContent(creds: WpCredentials): Promise<SyncResult> {
  const base = normaliseApiUrl(creds.apiUrl);
  const sections: string[] = [];
  let totalItems = 0;

  // ── Pages ────────────────────────────────────────────────────────────────
  const pages = await wpFetch<WpPost[]>(base, "/wp/v2/pages", creds, {
    per_page: MAX_ITEMS_PER_TYPE,
    status: "publish",
    _fields: "id,title,content,link",
  });
  if (pages && pages.length > 0) {
    totalItems += pages.length;
    const lines = pages.map((p) => {
      const title = stripHtml(p.title?.rendered ?? "");
      const body = stripHtml(p.content?.rendered ?? "").slice(0, MAX_ITEM_CHARS);
      return `Page: ${title}\n${body}`;
    });
    sections.push(`=== Pages (${pages.length}) ===\n${lines.join("\n\n")}`);
  }

  // ── Posts ────────────────────────────────────────────────────────────────
  const posts = await wpFetch<WpPost[]>(base, "/wp/v2/posts", creds, {
    per_page: MAX_ITEMS_PER_TYPE,
    status: "publish",
    _fields: "id,title,excerpt,content,link",
  });
  if (posts && posts.length > 0) {
    totalItems += posts.length;
    const lines = posts.map((p) => {
      const title = stripHtml(p.title?.rendered ?? "");
      const excerpt = stripHtml(p.excerpt?.rendered ?? "");
      const body = excerpt || stripHtml(p.content?.rendered ?? "").slice(0, MAX_ITEM_CHARS);
      return `Post: ${title}\n${body}`;
    });
    sections.push(`=== Posts (${posts.length}) ===\n${lines.join("\n\n")}`);
  }

  // ── Categories ───────────────────────────────────────────────────────────
  const cats = await wpFetch<WpPost[]>(base, "/wp/v2/categories", creds, {
    per_page: MAX_ITEMS_PER_TYPE,
    _fields: "id,name,description,count",
  });
  if (cats && cats.length > 0) {
    totalItems += cats.length;
    const lines = cats
      .filter((c) => c.name)
      .map((c) => {
        const desc = c.description ? ` — ${stripHtml(c.description)}` : "";
        return `${c.name}${desc}`;
      });
    sections.push(`=== Categories (${cats.length}) ===\n${lines.join("\n")}`);
  }

  // ── Tags ─────────────────────────────────────────────────────────────────
  const tags = await wpFetch<WpPost[]>(base, "/wp/v2/tags", creds, {
    per_page: MAX_ITEMS_PER_TYPE,
    _fields: "id,name,description",
  });
  if (tags && tags.length > 0) {
    totalItems += tags.length;
    const lines = tags
      .filter((t) => t.name)
      .map((t) => {
        const desc = t.description ? ` — ${stripHtml(t.description)}` : "";
        return `${t.name}${desc}`;
      });
    sections.push(`=== Tags (${tags.length}) ===\n${lines.join("\n")}`);
  }

  // ── Media (alt text / titles) ─────────────────────────────────────────
  const media = await wpFetch<WpPost[]>(base, "/wp/v2/media", creds, {
    per_page: 30,
    _fields: "id,title,alt_text,source_url",
  });
  if (media && media.length > 0) {
    totalItems += media.length;
    const lines = media
      .filter((m) => m.title?.rendered)
      .map((m) => `${stripHtml(m.title?.rendered ?? "")}`)
      .filter(Boolean);
    if (lines.length > 0) {
      sections.push(`=== Media (${lines.length} items) ===\n${lines.join("\n")}`);
    }
  }

  // ── Custom Post Types ────────────────────────────────────────────────────
  const builtIn = new Set(["post", "page", "attachment", "revision", "nav_menu_item", "custom_css", "customize_changeset", "oembed_cache", "user_request", "wp_block", "wp_template", "wp_template_part", "wp_navigation", "wp_font_family", "wp_font_face"]);
  const types = await wpFetch<Record<string, WpType>>(base, "/wp/v2/types", creds, {
    context: "view",
  });
  if (types) {
    const customTypes = Object.values(types).filter(
      (t) => !builtIn.has(t.slug) && t.rest_base
    );
    for (const ctype of customTypes.slice(0, 5)) {
      const items = await wpFetch<WpPost[]>(base, `/wp/v2/${ctype.rest_base}`, creds, {
        per_page: 30,
        _fields: "id,title,content,excerpt",
      });
      if (items && items.length > 0) {
        totalItems += items.length;
        const lines = items.map((item) => {
          const title = stripHtml(item.title?.rendered ?? item.name ?? "");
          const body = stripHtml(item.excerpt?.rendered || item.content?.rendered || "").slice(0, MAX_ITEM_CHARS);
          return title ? `${title}${body ? `\n${body}` : ""}` : body;
        }).filter(Boolean);
        if (lines.length > 0) {
          sections.push(`=== ${ctype.name} (${items.length}) ===\n${lines.join("\n\n")}`);
        }
      }
    }
  }

  if (sections.length === 0) {
    return {
      ok: false,
      totalItems: 0,
      contentCache: "",
      error: "No content found. The WordPress site may be empty or credentials may be insufficient.",
    };
  }

  // Join and cap total size
  let combined = sections.join("\n\n");
  if (combined.length > 50_000) combined = combined.slice(0, 50_000);

  return { ok: true, totalItems, contentCache: combined };
}

/** Sync a single company's WordPress integration and persist to DB */
export async function syncCompanyWordPress(companyId: number): Promise<boolean> {
  const [integration] = await db
    .select()
    .from(companyWordPressIntegrationsTable)
    .where(eq(companyWordPressIntegrationsTable.companyId, companyId))
    .limit(1);

  if (!integration) return false;

  try {
    const result = await fetchWordPressContent({
      apiUrl: integration.apiUrl,
      username: integration.username,
      appPassword: integration.appPassword,
    });

    if (!result.ok) {
      await db
        .update(companyWordPressIntegrationsTable)
        .set({ status: "error", errorMessage: result.error ?? "Sync failed" })
        .where(eq(companyWordPressIntegrationsTable.id, integration.id));
      return false;
    }

    await db
      .update(companyWordPressIntegrationsTable)
      .set({
        status: "connected",
        errorMessage: null,
        lastSynced: new Date(),
        contentCache: result.contentCache,
        totalItems: result.totalItems,
      })
      .where(eq(companyWordPressIntegrationsTable.id, integration.id));

    return true;
  } catch (err) {
    logger.error({ err, companyId }, "WordPress sync error");
    await db
      .update(companyWordPressIntegrationsTable)
      .set({ status: "error", errorMessage: "Unexpected error during sync" })
      .where(eq(companyWordPressIntegrationsTable.id, integration.id));
    return false;
  }
}

/** Scheduled: sync all companies that have autoSync enabled */
export async function syncAllWordPressIntegrations(): Promise<void> {
  try {
    const integrations = await db
      .select({ companyId: companyWordPressIntegrationsTable.companyId })
      .from(companyWordPressIntegrationsTable)
      .where(eq(companyWordPressIntegrationsTable.autoSync, true));

    if (integrations.length === 0) return;

    logger.info({ count: integrations.length }, "WordPress AutoSync: starting");
    let synced = 0;
    for (const { companyId } of integrations) {
      const ok = await syncCompanyWordPress(companyId);
      if (ok) synced++;
    }
    logger.info({ synced, total: integrations.length }, "WordPress AutoSync: complete");
  } catch (err) {
    logger.error({ err }, "WordPress AutoSync: error");
  }
}

/** Returns the WordPress knowledge section for the AI system prompt */
export async function getWordPressKnowledgeSection(companyId: number): Promise<string> {
  try {
    const [integration] = await db
      .select({
        status: companyWordPressIntegrationsTable.status,
        contentCache: companyWordPressIntegrationsTable.contentCache,
        apiUrl: companyWordPressIntegrationsTable.apiUrl,
      })
      .from(companyWordPressIntegrationsTable)
      .where(eq(companyWordPressIntegrationsTable.companyId, companyId))
      .limit(1);

    if (!integration || integration.status !== "connected" || !integration.contentCache) {
      return "";
    }

    const content = integration.contentCache.slice(0, MAX_PROMPT_CHARS);
    return `\n\nWordPress Knowledge Base (from ${integration.apiUrl}):\n${content}`;
  } catch {
    return "";
  }
}
