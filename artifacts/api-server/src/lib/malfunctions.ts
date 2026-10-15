import { db, malfunctionsTable } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import { logger } from "./logger";
import OpenAI from "openai";

export async function reportSystemMalfunction(title: string, description: string, companyId?: number, rawError?: any) {
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

    let finalDescription = description;

    // Use AI to generate a friendly explanation if rawError is provided and OPENAI_API_KEY is available
    if (rawError && process.env.OPENAI_API_KEY) {
      try {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const errorText = rawError instanceof Error ? rawError.message + " " + (rawError.stack || "") : String(rawError);
        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: "You are an AI assistant for a SaaS platform. A technical error occurred. Read the error and provide a very short, simple, non-technical explanation in Arabic (1-2 sentences) addressed to the client, explaining what went wrong and suggesting a basic fix (e.g., check settings, wait a bit). Do not mention code, stack traces, or servers."
            },
            {
              role: "user",
              content: "Context: \nError: "
            }
          ]
        });

        const aiText = response.choices[0]?.message?.content?.trim();
        if (aiText) {
          finalDescription = aiText;
        }
      } catch (aiErr) {
        logger.error({ aiErr }, "Failed to generate AI malfunction explanation");
      }
    }
    
    await db.insert(malfunctionsTable).values({
      companyId: companyId || null,
      title,
      description: finalDescription,
      source: "system",
      isActive: true,
    });
    
    logger.info({ title, companyId }, "Auto-reported system malfunction");

    // Send email notification to company.notificationEmail
    const { notifySystemMalfunction } = await import("./companyNotification");
    const { companiesTable } = await import("@workspace/db");
    if (companyId) {
      const [company] = await db
        .select({ id: companiesTable.id, name: companiesTable.name })
        .from(companiesTable)
        .where(eq(companiesTable.id, companyId))
        .limit(1);

      if (company) {
        notifySystemMalfunction(
          { id: company.id, name: company.name },
          { title, description: finalDescription, rawError }
        ).catch((err) => logger.error({ err, companyId }, "Failed to send malfunction notification email"));
      }

      // Also alert Admin notification bell icon and send email to admin recipient
      const { sendMalfunctionNotification } = await import("./email");
      sendMalfunctionNotification({
        title,
        description: finalDescription,
        source: "system",
        companyId,
        companyName: company?.name,
      }).catch((err) => logger.error({ err }, "Failed to send admin malfunction notification"));
    } else {
      // Global malfunction: notify active companies
      const activeCompanies = await db
        .select({ id: companiesTable.id, name: companiesTable.name })
        .from(companiesTable)
        .where(eq(companiesTable.isActive, true));

      for (const comp of activeCompanies) {
        notifySystemMalfunction(
          { id: comp.id, name: comp.name },
          { title, description: finalDescription, rawError }
        ).catch(() => {});
      }

      // Also alert Admin notification bell icon and send email to admin recipient
      const { sendMalfunctionNotification } = await import("./email");
      sendMalfunctionNotification({
        title,
        description: finalDescription,
        source: "system",
      }).catch((err) => logger.error({ err }, "Failed to send admin malfunction notification"));
    }
  } catch (err) {
    logger.error({ err }, "Failed to auto-report malfunction");
  }
}