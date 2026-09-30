const fs = require('fs');
const path = require('path');

// Fix client.ts ticket notifications
const clientTsPath = path.join(__dirname, '../artifacts/api-server/src/routes/client.ts');
if (fs.existsSync(clientTsPath)) {
    let content = fs.readFileSync(clientTsPath, 'utf8');

    const searchStr = `    const [user] = await db
      .select({ name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, req.session.userId!));

    sendNewTicketNotification({
      id: ticket.id,
      title: ticket.title,
      description: ticket.description,
      clientName: user?.name ?? "Unknown",
    });`;

    const replaceStr = `    const [user] = await db
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

    if (content.includes(searchStr)) {
        content = content.replace(searchStr, replaceStr);
        fs.writeFileSync(clientTsPath, content, 'utf8');
        console.log("Patched client.ts successfully");
    } else {
        console.log("Could not find the target string in client.ts");
    }
} else {
    console.log("client.ts not found");
}

// Fix DashboardLayout.tsx overflow
const layoutPath = path.join(__dirname, '../artifacts/chatbot-admin/src/components/layout/DashboardLayout.tsx');
if (fs.existsSync(layoutPath)) {
    let content = fs.readFileSync(layoutPath, 'utf8');
    content = content.replace(
        /<main className="flex-1 flex flex-col overflow-hidden">/g,
        '<main className="flex-1 min-w-0 flex flex-col overflow-hidden">'
    );
    // There might also be a `<div className="flex-1 overflow-y-auto">` inside it? No, if `main` has `min-w-0`, the whole flex item can shrink.
    fs.writeFileSync(layoutPath, content, 'utf8');
    console.log("Patched DashboardLayout.tsx successfully");
} else {
    console.log("DashboardLayout.tsx not found");
}
