const fs = require('fs');
const path = 'artifacts/api-server/src/lib/handoff.ts';
let code = fs.readFileSync(path, 'utf8');

const importRegex = /import \{ (.*?) \} from "@workspace\/db";/;
if (code.match(importRegex)) {
  code = code.replace(importRegex, 'import { $1, notificationsTable, usersTable } from "@workspace/db";');
} else {
  code = 'import { notificationsTable, usersTable } from "@workspace/db";\n' + code;
}

const newImports = `
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { logger } from "./logger";
import { sendClientNotification } from "./email";
`;
code = newImports + code;

const helper = `
export async function triggerHandoffNotification(company: { id: number, clientId: number | null, name: string }, sessionId: string, channel: string) {
  if (!company.clientId) return;
  
  try {
    const title = \`New Human Handoff Request (\${channel})\`;
    const message = \`A customer on \${channel} wants to speak with a human agent. Please check the Universal Chat.\\nSession: \${sessionId}\`;

    await db.insert(notificationsTable).values({
      userId: company.clientId,
      type: "handoff_request",
      title,
      message,
      companyId: company.id,
      isRead: false
    });

    const [user] = await db
      .select({ email: usersTable.notificationEmail, fallback: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.id, company.clientId))
      .limit(1);
    
    if (user) {
      const emailToUse = user.email || user.fallback;
      if (emailToUse) {
        await sendClientNotification(emailToUse, title, message).catch(e => logger.warn({ err: e }, "Handoff email failed"));
      }
    }
  } catch (err) {
    logger.error({ err, companyId: company.id }, "Failed to trigger handoff notification");
  }
}
`;

code += '\n' + helper;
fs.writeFileSync(path, code);
console.log('Added triggerHandoffNotification to handoff.ts');
