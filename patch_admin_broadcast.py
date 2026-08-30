import re

with open('artifacts/api-server/src/routes/admin.ts', 'r', encoding='utf-8') as f:
    content = f.read()

replacement = """    let companies = await db.select({
      id: companiesTable.id,
      clientId: companiesTable.clientId,
      name: companiesTable.name,
      isActive: companiesTable.isActive,
      notificationEmail: usersTable.notificationEmail,
    }).from(companiesTable)
    .leftJoin(usersTable, eq(companiesTable.clientId, usersTable.id));

    if (validTarget === "active") companies = companies.filter((c) => c.isActive);
    else if (validTarget === "inactive") companies = companies.filter((c) => !c.isActive);

    if (companies.length === 0) {
      res.json({ sent: 0, message: "No matching companies found." });
      return;
    }

    // Insert one notification per client
    await db.insert(notificationsTable).values(
      companies.map((c) => ({
        userId: c.clientId,
        type: "broadcast",
        title: title.trim(),
        message: message.trim(),
        companyId: c.id,
        isRead: false,
      }))
    );

    // Send emails
    for (const c of companies) {
      if (c.notificationEmail) {
        // We shouldn't block the request, fire and forget
        sendClientNotification(c.notificationEmail, title.trim(), message.trim()).catch(e => {
          logger.error({ err: e, email: c.notificationEmail }, "Failed to send client notification email");
        });
      }
    }"""

content = re.sub(
    r'    let companies = await db\.select\(\{\n      id: companiesTable\.id,\n      clientId: companiesTable\.clientId,\n      name: companiesTable\.name,\n      isActive: companiesTable\.isActive,\n    \}\)\.from\(companiesTable\);\n\n    if \(validTarget === "active"\) companies = companies\.filter\(\(c\) => c\.isActive\);\n    else if \(validTarget === "inactive"\) companies = companies\.filter\(\(c\) => !c\.isActive\);\n\n    if \(companies\.length === 0\) \{\n      res\.json\(\{\n? ?sent: 0, message: "No matching companies found." ?\}\);\n      return;\n    \}\n\n    // Insert one notification per client\n    await db\.insert\(notificationsTable\)\.values\(\n      companies\.map\(\(c\) => \(\{\n        userId: c\.clientId,\n        type: "broadcast",\n        title: title\.trim\(\),\n        message: message\.trim\(\),\n        companyId: c\.id,\n        isRead: false,\n      \}\)\)\n    \);',
    replacement,
    content
)

if 'sendClientNotification' not in content:
    content = content.replace('import { sendNewTicketNotification', 'import { sendNewTicketNotification, sendClientNotification')

with open('artifacts/api-server/src/routes/admin.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print("Patched admin.ts")
