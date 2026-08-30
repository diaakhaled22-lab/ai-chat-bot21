import re

with open('artifacts/api-server/src/index.ts', 'r', encoding='utf-8') as f:
    content = f.read()

replacement = """    const activeCompanies = await db
      .select({
        id: companiesTable.id,
        clientId: companiesTable.clientId,
        name: companiesTable.name,
        activationEnd: companiesTable.activationEnd,
        notificationEmail: usersTable.notificationEmail,
      })
      .from(companiesTable)
      .leftJoin(usersTable, eq(companiesTable.clientId, usersTable.id))
      .where(
        and(
          eq(companiesTable.isActive, true),
          isNotNull(companiesTable.activationEnd)
        )
      );"""

content = re.sub(
    r'    const activeCompanies = await db\s+\.select\(\)\s+\.from\(companiesTable\)\s+\.where\(\s+and\(\s+eq\(companiesTable\.isActive, true\),\s+isNotNull\(companiesTable\.activationEnd\)\s+\)\s+\);',
    replacement,
    content
)

email_replacement = """      await db.insert(notificationsTable).values(toInsert);
      
      if (company.notificationEmail) {
        sendClientNotification(
          company.notificationEmail, 
          "Subscription expiring soon", 
          `Your subscription expires on ${endDate}. Please contact your administrator to renew.`
        ).catch(e => {
          logger.error({ err: e, email: company.notificationEmail }, "Failed to send renewal reminder email");
        });
      }
      
      logger.info({ companyId: company.id, companyName: company.name }, "Sent renewal reminder notifications");"""

content = re.sub(
    r'      await db\.insert\(notificationsTable\)\.values\(toInsert\);\n      logger\.info\(\{ companyId: company\.id, companyName: company\.name \}, "Sent renewal reminder notifications"\);',
    email_replacement,
    content
)

if 'sendClientNotification' not in content:
    content = content.replace('import { logger } from "./lib/logger";', 'import { logger } from "./lib/logger";\nimport { sendClientNotification } from "./lib/email";')

with open('artifacts/api-server/src/index.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print("Patched index.ts")
