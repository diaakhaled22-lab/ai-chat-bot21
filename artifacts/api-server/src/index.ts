import { initWebSocket } from "./lib/ws";
import app from "./app";
import { logger } from "./lib/logger";
import { db } from "@workspace/db";
import { adminConfigTable, chatLogsTable, companiesTable, companyActivityLogsTable, notificationsTable, usersTable, leadsTable } from "@workspace/db";
import { and, eq, lt, isNotNull, gte, lte } from "drizzle-orm";
import { syncAllAutoSyncCompanies } from "./lib/websiteSync";
import { syncAllWordPressIntegrations } from "./lib/wordpressSync";
import { syncAllRestApiIntegrations, ensureRestApiSchema } from "./lib/restApiSync";
import { syncAllShopifyIntegrations, ensureShopifySchema } from "./lib/shopifySync";
import { refreshAiModels } from "./lib/aiModels";
import { ensureAdminExists, ensureDataSourcePermissionsSchema } from "./lib/adminBootstrap";
import { loadBlockedIpsFromDb, loadTotpSecretsFromDb } from "./lib/security";
import { ensureEmailNotificationSchema, notifySubscriptionExpiringSoon, notifySubscriptionExpired } from "./lib/companyNotification";
import { ensureRagSchema } from "./lib/knowledgeRag";
import { ensureVoiceSchema } from "./lib/audio";

const rawPort = process.env["API_PORT"] || (process.env["PORT"] && process.env["PORT"] !== "3000" && process.env["PORT"] !== "5173" ? process.env["PORT"] : "8080");
const port = Number(rawPort) || 8080;

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

      // Notify each expired company via Resend to company.notificationEmail
      for (const r of expired) {
        notifySubscriptionExpired({ id: r.id, name: r.name }, now).catch((err) => {
          logger.error({ err, companyId: r.id }, "Failed to send subscription expired email");
        });
      }
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
    const eightDaysFromNow = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000);

    const expiring = await db
      .select({
        id: companiesTable.id,
        name: companiesTable.name,
        clientId: companiesTable.clientId,
        activationEnd: companiesTable.activationEnd,
        notificationEmail: companiesTable.notificationEmail,
      })
      .from(companiesTable)
      .where(
        and(
          eq(companiesTable.isActive, true),
          isNotNull(companiesTable.activationEnd),
          gte(companiesTable.activationEnd, now),
          lte(companiesTable.activationEnd, eightDaysFromNow)
        )
      );

    if (expiring.length === 0) return;

    for (const company of expiring) {
      if (!company.activationEnd) continue;
      const diffMs = company.activationEnd.getTime() - now.getTime();
      const daysRemaining = Math.ceil(diffMs / (24 * 60 * 60 * 1000));

      let milestone: (7 | 3 | 1) | null = null;
      if (daysRemaining <= 7 && daysRemaining > 3) {
        milestone = 7;
      } else if (daysRemaining <= 3 && daysRemaining > 1) {
        milestone = 3;
      } else if (daysRemaining <= 1 && daysRemaining >= 0) {
        milestone = 1;
      }

      if (!milestone) continue;

      const reminderType = `renewal_reminder_${milestone}d`;
      // Check if reminder for this specific milestone was already sent
      const [existing] = await db
        .select({ id: notificationsTable.id })
        .from(notificationsTable)
        .where(
          and(
            eq(notificationsTable.companyId, company.id),
            eq(notificationsTable.type, reminderType)
          )
        )
        .limit(1);

      if (existing) continue;

      const endDate = company.activationEnd.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

      if (company.clientId) {
        await db.insert(notificationsTable).values({
          userId: company.clientId,
          type: reminderType,
          title: `${milestone} day${milestone > 1 ? "s" : ""} left on subscription | بقي ${milestone} أيام على انتهاء الاشتراك`,
          message: `Your subscription expires on ${endDate}. Please contact your administrator to renew.`,
          companyId: company.id,
        });
      }

      // Send email ONLY to the company that owns the data (company.notificationEmail)
      notifySubscriptionExpiringSoon(
        { id: company.id, name: company.name },
        milestone,
        company.activationEnd
      ).catch((err) => {
        logger.error({ err, companyId: company.id, milestone }, "Failed to send subscription renewal reminder email");
      });

      logger.info({ companyId: company.id, companyName: company.name, milestone }, "Sent milestone renewal reminder");
    }
  } catch (err) {
    logger.error({ err }, "Error sending renewal reminders");
  }
}

setInterval(sendRenewalReminders, 60 * 60 * 1000);
sendRenewalReminders();

// Auto-purge chat logs: Default is permanent retention (0 = never delete).
// Chat logs, token metrics, and dashboard statistics are preserved permanently even if subscription is not active.
async function purgeOldChatLogs() {
  try {
    const [adminRow] = await db
      .select()
      .from(adminConfigTable)
      .where(eq(adminConfigTable.key, "chat_log_retention_days"))
      .limit(1);
    // Default to 0 (never delete / permanent) unless admin explicitly set a positive retention policy
    const globalRetentionDays = adminRow?.value ? parseInt(adminRow.value, 10) : 0;

    const companies = await db
      .select({ id: companiesTable.id, chatLogRetentionDays: companiesTable.chatLogRetentionDays })
      .from(companiesTable);

    let totalDeleted = 0;
    for (const company of companies) {
      // If company retention is null or <= 0, and global retention is <= 0, never delete logs
      const retentionDays = company.chatLogRetentionDays ?? globalRetentionDays;
      if (!retentionDays || retentionDays <= 0) {
        // Permanent retention: keep all logs forever so dashboard data is never lost
        continue;
      }
      const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
      const deleted = await db
        .delete(chatLogsTable)
        .where(and(eq(chatLogsTable.companyId, company.id), lt(chatLogsTable.createdAt, cutoff)))
        .returning({ id: chatLogsTable.id });
      totalDeleted += deleted.length;
    }

    if (totalDeleted > 0) {
      logger.info({ count: totalDeleted }, "Purged old chat logs based on explicit retention policy");
    }
  } catch (err) {
    logger.error({ err }, "Error purging old chat logs");
  }
}

setInterval(purgeOldChatLogs, 60 * 60 * 1000); // Run every hour
purgeOldChatLogs();

// Auto-purge leads: Default is permanent retention (0 = never delete).
async function purgeOldLeads() {
  try {
    const [adminRow] = await db
      .select()
      .from(adminConfigTable)
      .where(eq(adminConfigTable.key, "chat_log_retention_days"))
      .limit(1);
    const globalRetentionDays = adminRow?.value ? parseInt(adminRow.value, 10) : 0;

    const companies = await db
      .select({ id: companiesTable.id, chatLogRetentionDays: companiesTable.chatLogRetentionDays })
      .from(companiesTable);

    let totalDeleted = 0;
    for (const company of companies) {
      const retentionDays = company.chatLogRetentionDays ?? globalRetentionDays;
      if (!retentionDays || retentionDays <= 0) {
        continue;
      }
      const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
      const deleted = await db
        .delete(leadsTable)
        .where(and(eq(leadsTable.companyId, company.id), lt(leadsTable.createdAt, cutoff)))
        .returning({ id: leadsTable.id });
      totalDeleted += deleted.length;
    }

    if (totalDeleted > 0) {
      logger.info({ count: totalDeleted }, "Purged old leads based on explicit retention policy");
    }
  } catch (err) {
    logger.error({ err }, "Error purging old leads");
  }
}

setInterval(purgeOldLeads, 60 * 60 * 1000); // Run every hour
purgeOldLeads();

// AutoSync: re-scrape website URLs every 6 hours for companies with websiteAutoSync enabled
setInterval(syncAllAutoSyncCompanies, 6 * 60 * 60 * 1000);
syncAllAutoSyncCompanies();

// AutoSync: re-sync WordPress integrations every 6 hours
setInterval(syncAllWordPressIntegrations, 6 * 60 * 60 * 1000);
syncAllWordPressIntegrations();

// AutoSync: re-sync custom REST API integrations every 6 hours
setInterval(syncAllRestApiIntegrations, 6 * 60 * 60 * 1000);
syncAllRestApiIntegrations();

// AutoSync: re-sync Shopify store integrations every 6 hours
setInterval(syncAllShopifyIntegrations, 6 * 60 * 60 * 1000);
syncAllShopifyIntegrations();

// Refresh provider model catalogs hourly so new API models appear automatically.
setInterval(() => {
  refreshAiModels().catch((err) => logger.warn({ err }, "Scheduled AI model catalog sync failed"));
}, 60 * 60 * 1000);
refreshAiModels().catch((err) => logger.warn({ err }, "Initial AI model catalog sync failed"));

// Ensure the default admin is ready before accepting requests. This guards
// against fresh database resets and avoids a login race during startup.
async function startServer() {
  await ensureAdminExists();
  await ensureEmailNotificationSchema();
  await ensureRagSchema();
  await ensureVoiceSchema();
  await ensureRestApiSchema();
  await ensureShopifySchema();
  await ensureDataSourcePermissionsSchema();
  await loadBlockedIpsFromDb();
  await loadTotpSecretsFromDb();

  const server = app.listen(port, "0.0.0.0", (err?: Error) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });

  initWebSocket(server);
}

void startServer();
