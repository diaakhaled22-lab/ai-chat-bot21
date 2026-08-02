import app from "./app";
import { logger } from "./lib/logger";
import { db } from "@workspace/db";
import { adminConfigTable, chatLogsTable, companiesTable, companyActivityLogsTable, notificationsTable, usersTable } from "@workspace/db";
import { and, eq, lt, isNotNull, gte, lte } from "drizzle-orm";
import { syncAllAutoSyncCompanies } from "./lib/websiteSync";
import { syncAllWordPressIntegrations } from "./lib/wordpressSync";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function expireCompanies() {
  try {
    const now = new Date();
    const expired = await db
      .update(companiesTable)
      .set({ isActive: false })
      .where(
        and(
          eq(companiesTable.isActive, true),
          isNotNull(companiesTable.activationEnd),
          lt(companiesTable.activationEnd, now)
        )
      )
      .returning({ id: companiesTable.id, name: companiesTable.name });

    if (expired.length > 0) {
      logger.info({ count: expired.length, ids: expired.map(r => r.id) }, "Auto-expired companies past activation end date");
      await db.insert(companyActivityLogsTable).values(
        expired.map((r) => ({
          companyId: r.id,
          action: "expired",
          performedBy: "System",
          note: `Auto-deactivated: activation end date passed`,
        }))
      );
    }
  } catch (err) {
    logger.error({ err }, "Error auto-expiring companies");
  }
}

setInterval(expireCompanies, 60 * 1000);
expireCompanies();

async function sendRenewalReminders() {
  try {
    const now = new Date();
    const twoDaysFromNow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

    const expiring = await db
      .select({
        id: companiesTable.id,
        name: companiesTable.name,
        clientId: companiesTable.clientId,
        activationEnd: companiesTable.activationEnd,
      })
      .from(companiesTable)
      .where(
        and(
          eq(companiesTable.isActive, true),
          isNotNull(companiesTable.activationEnd),
          gte(companiesTable.activationEnd, now),
          lte(companiesTable.activationEnd, twoDaysFromNow)
        )
      );

    if (expiring.length === 0) return;

    const adminUsers = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.role, "admin"));

    for (const company of expiring) {
      const existing = await db
        .select({ id: notificationsTable.id })
        .from(notificationsTable)
        .where(
          and(
            eq(notificationsTable.userId, company.clientId),
            eq(notificationsTable.type, "renewal_reminder"),
            eq(notificationsTable.companyId, company.id),
            gte(notificationsTable.createdAt, threeDaysAgo)
          )
        )
        .limit(1);

      if (existing.length > 0) continue;

      const endDate = company.activationEnd!.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

      const toInsert = [
        {
          userId: company.clientId,
          type: "renewal_reminder" as const,
          title: "Subscription expiring soon",
          message: `Your subscription expires on ${endDate}. Please contact your administrator to renew.`,
          companyId: company.id,
        },
        ...adminUsers.map((admin) => ({
          userId: admin.id,
          type: "renewal_reminder" as const,
          title: `Renewal reminder: ${company.name}`,
          message: `${company.name}'s subscription expires on ${endDate}.`,
          companyId: company.id,
        })),
      ];

      await db.insert(notificationsTable).values(toInsert);
      logger.info({ companyId: company.id, companyName: company.name }, "Sent renewal reminder notifications");
    }
  } catch (err) {
    logger.error({ err }, "Error sending renewal reminders");
  }
}

setInterval(sendRenewalReminders, 60 * 60 * 1000);
sendRenewalReminders();

// Auto-purge chat logs older than each company's retention setting (default 7 days)
async function purgeOldChatLogs() {
  try {
    const [adminRow] = await db
      .select()
      .from(adminConfigTable)
      .where(eq(adminConfigTable.key, "chat_log_retention_days"))
      .limit(1);
    const globalRetentionDays = adminRow?.value ? parseInt(adminRow.value, 10) : 7;

    const companies = await db
      .select({ id: companiesTable.id, chatLogRetentionDays: companiesTable.chatLogRetentionDays })
      .from(companiesTable);

    let totalDeleted = 0;
    for (const company of companies) {
      const retentionDays = company.chatLogRetentionDays ?? globalRetentionDays;
      const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
      const deleted = await db
        .delete(chatLogsTable)
        .where(and(eq(chatLogsTable.companyId, company.id), lt(chatLogsTable.createdAt, cutoff)))
        .returning({ id: chatLogsTable.id });
      totalDeleted += deleted.length;
    }

    if (totalDeleted > 0) {
      logger.info({ count: totalDeleted }, "Purged old chat logs based on retention policy");
    }
  } catch (err) {
    logger.error({ err }, "Error purging old chat logs");
  }
}

setInterval(purgeOldChatLogs, 60 * 60 * 1000); // Run every hour
purgeOldChatLogs();

// AutoSync: re-scrape website URLs every 6 hours for companies with websiteAutoSync enabled
setInterval(syncAllAutoSyncCompanies, 6 * 60 * 60 * 1000);
syncAllAutoSyncCompanies();

// AutoSync: re-sync WordPress integrations every 6 hours
setInterval(syncAllWordPressIntegrations, 6 * 60 * 60 * 1000);
syncAllWordPressIntegrations();

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
