import { db, companiesTable } from "@workspace/db";
import { eq, and, eq as drizzleEq } from "drizzle-orm";
import { logger } from "./logger";
import { isSafeUrl } from "./security";

/**
 * Fetches a URL and strips HTML tags, returning cleaned plain text (max 6000 chars).
 * Returns null on failure.
 */
export async function scrapeWebsite(url: string): Promise<string | null> {
  try {
    // SSRF protection — block internal/private URLs
    if (!isSafeUrl(url)) {
      logger.warn({ url }, "scrapeWebsite blocked: URL points to internal address");
      return null;
    }
    const res = await fetch(url, {
      headers: { "User-Agent": "ChatbotAutoSync/1.0" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const raw = await res.text();
    const cleaned = raw
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim()
      .slice(0, 6000);
    return cleaned || null;
  } catch (err) {
    logger.warn({ err, url }, "scrapeWebsite fetch failed");
    return null;
  }
}

/**
 * Splits rawUrls string (by newline, comma, or semicolon) and returns valid http/https URLs.
 */
export function extractUrls(rawUrls: string): string[] {
  if (!rawUrls) return [];
  return rawUrls
    .split(/[\n,;]+/)
    .map((u) => u.trim())
    .filter((u) => u.startsWith("http://") || u.startsWith("https://"));
}

/**
 * Scrapes the websiteDataUrl (supporting multiple URLs) for a single company and persists the result to
 * websiteContentCache + websiteLastSynced. Returns true on success.
 */
export async function syncCompanyWebsite(
  company: Pick<typeof companiesTable.$inferSelect, "id" | "websiteDataUrl">
): Promise<boolean> {
  if (!company.websiteDataUrl) return false;
  const urls = extractUrls(company.websiteDataUrl);
  if (urls.length === 0) return false;

  const scrapedList: string[] = [];
  for (const url of urls) {
    const content = await scrapeWebsite(url);
    if (content) {
      scrapedList.push(`[Website Source: ${url}]\n${content}`);
    }
  }

  if (scrapedList.length === 0) return false;

  const combined = scrapedList.join("\n\n---\n\n").slice(0, 30000);

  await db
    .update(companiesTable)
    .set({ websiteContentCache: combined, websiteLastSynced: new Date() })
    .where(eq(companiesTable.id, company.id));
  return true;
}

/**
 * Scheduled job: sync all companies that have websiteAutoSync enabled and a
 * websiteDataUrl set. Called every 6 hours from index.ts.
 */
export async function syncAllAutoSyncCompanies(): Promise<void> {
  try {
    const companies = await db
      .select({ id: companiesTable.id, websiteDataUrl: companiesTable.websiteDataUrl })
      .from(companiesTable)
      .where(
        and(
          drizzleEq(companiesTable.websiteAutoSync, true),
        )
      );

    if (companies.length === 0) return;

    logger.info({ count: companies.length }, "AutoSync: starting website sync for companies");

    let synced = 0;
    for (const company of companies) {
      const ok = await syncCompanyWebsite(company);
      if (ok) synced++;
    }

    logger.info({ synced, total: companies.length }, "AutoSync: website sync complete");
  } catch (err) {
    logger.error({ err }, "AutoSync: error during scheduled website sync");
  }
}

/**
 * Returns the website knowledge section to inject into the AI system prompt.
 * Uses websiteContentCache when autoSync is enabled; falls back to a live
 * fetch when autoSync is off and one or more URLs are configured.
 */
export async function getWebsiteKnowledgeSection(
  company: Pick<
    typeof companiesTable.$inferSelect,
    "websiteDataUrl" | "websiteAutoSync" | "websiteContentCache"
  >
): Promise<string> {
  if (!company.websiteDataUrl) return "";

  let content: string | null = null;

  if (company.websiteAutoSync) {
    // Use the pre-cached content
    content = company.websiteContentCache ?? null;
  } else {
    // Live fetch (scrapes all configured URLs)
    const urls = extractUrls(company.websiteDataUrl);
    const scrapedList: string[] = [];
    for (const url of urls) {
      const text = await scrapeWebsite(url);
      if (text) {
        scrapedList.push(`[Website Source: ${url}]\n${text}`);
      }
    }
    content = scrapedList.length > 0 ? scrapedList.join("\n\n---\n\n").slice(0, 30000) : null;
  }

  if (!content) return "";
  return `\n\nWebsite Knowledge Base:\n${content}`;
}
