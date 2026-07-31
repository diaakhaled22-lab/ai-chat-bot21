import { db, companiesTable } from "@workspace/db";
import { eq, and, eq as drizzleEq } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Fetches a URL and strips HTML tags, returning cleaned plain text (max 6000 chars).
 * Returns null on failure.
 */
export async function scrapeWebsite(url: string): Promise<string | null> {
  try {
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
 * Scrapes the websiteDataUrl for a single company and persists the result to
 * websiteContentCache + websiteLastSynced.  Returns true on success.
 */
export async function syncCompanyWebsite(
  company: Pick<typeof companiesTable.$inferSelect, "id" | "websiteDataUrl">
): Promise<boolean> {
  if (!company.websiteDataUrl) return false;
  const content = await scrapeWebsite(company.websiteDataUrl);
  if (!content) return false;
  await db
    .update(companiesTable)
    .set({ websiteContentCache: content, websiteLastSynced: new Date() })
    .where(eq(companiesTable.id, company.id));
  return true;
}

/**
 * Scheduled job: sync all companies that have websiteAutoSync enabled and a
 * websiteDataUrl set.  Called every 6 hours from index.ts.
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
 * fetch when autoSync is off and a URL is configured.
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
    // Live fetch (original behaviour)
    content = await scrapeWebsite(company.websiteDataUrl);
  }

  if (!content) return "";
  return `\n\nWebsite Knowledge Base (from ${company.websiteDataUrl}):\n${content}`;
}
