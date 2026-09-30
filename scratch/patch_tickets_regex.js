const fs = require('fs');
const path = require('path');

const clientTsPath = path.join(__dirname, '../artifacts/api-server/src/routes/client.ts');
if (fs.existsSync(clientTsPath)) {
    let content = fs.readFileSync(clientTsPath, 'utf8');

    const searchRegex = /const \[user\] = await db\s*\.select\(\{ name: usersTable\.name \}\)\s*\.from\(usersTable\)\s*\.where\(eq\(usersTable\.id, req\.session\.userId!\)\);\s*sendNewTicketNotification\(\{[\s\S]*?clientName: user\?\.name \?\? "Unknown",\s*\}\);/m;

    const replaceStr = `const [user] = await db
      .select({ name: usersTable.name, companyId: usersTable.companyId })
      .from(usersTable)
      .where(eq(usersTable.id, req.session.userId!));

    // Create notifications for all admins
    const admins = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.role, "admin"));
      
    if (admins.length > 0) {
      await db.insert(notificationsTable).values(
        admins.map(admin => ({
          userId: admin.id,
          type: "ticket",
          title: \`New Problem: \${ticket.title}\`,
          message: \`Client \${user?.name ?? "Unknown"} reported a problem.\`,
          companyId: user?.companyId ?? null,
        }))
      );
    }

    sendNewTicketNotification({
      id: ticket.id,
      title: ticket.title,
      description: ticket.description,
      clientName: user?.name ?? "Unknown",
    }).catch(err => {
      logger.error({ err }, "Failed to send new ticket notification email");
    });`;

    if (searchRegex.test(content)) {
        content = content.replace(searchRegex, replaceStr);
        fs.writeFileSync(clientTsPath, content, 'utf8');
        console.log("Patched client.ts successfully with regex");
    } else {
        console.log("Regex didn't match anything in client.ts");
    }
}
