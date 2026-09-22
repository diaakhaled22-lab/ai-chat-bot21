import { db, malfunctionsTable } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import { logger } from "./logger";

export async function reportSystemMalfunction(title: string, description: string, companyId?: number) {
  try {
    const existing = await db.select().from(malfunctionsTable)
      .where(and(
        eq(malfunctionsTable.isActive, true),
        eq(malfunctionsTable.title, title),
        companyId ? eq(malfunctionsTable.companyId, companyId) : isNull(malfunctionsTable.companyId)
      ));
      
    if (existing.length > 0) {
      return;
    }
    
    await db.insert(malfunctionsTable).values({
      companyId: companyId || null,
      title,
      description,
      source: "system",`n      isActive: true,
    });
    logger.info({ title, companyId }, "Auto-reported system malfunction");
  } catch (err) {
    logger.error({ err }, "Failed to auto-report malfunction");
  }
}