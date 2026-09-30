const fs = require('fs');
const p = 'artifacts/api-server/src/routes/client.ts';
let code = fs.readFileSync(p, 'utf8');

if (!code.includes('cannedResponsesTable')) {
  // Add import
  code = code.replace(
    'import { db, companiesTable, chatLogsTable, leadsTable, adminConfigTable } from "@workspace/db";',
    'import { db, companiesTable, chatLogsTable, leadsTable, adminConfigTable, cannedResponsesTable } from "@workspace/db";'
  );

  const routes = `
  // GET /client/canned-responses
  router.get("/client/canned-responses", async (req, res) => {
    try {
      const [company] = await db.select().from(companiesTable).where(eq(companiesTable.clientId, req.session.userId!)).limit(1);
      if (!company) { res.status(404).json({ error: "No company found" }); return; }
      const responses = await db.select().from(cannedResponsesTable).where(eq(cannedResponsesTable.companyId, company.id));
      res.json(responses);
    } catch (err) {
      logger.error({ err }, "Get canned responses error");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /client/canned-responses
  router.post("/client/canned-responses", async (req, res) => {
    try {
      const { title, content } = req.body;
      const [company] = await db.select().from(companiesTable).where(eq(companiesTable.clientId, req.session.userId!)).limit(1);
      if (!company) { res.status(404).json({ error: "No company found" }); return; }
      const [newResponse] = await db.insert(cannedResponsesTable).values({ companyId: company.id, title, content }).returning();
      res.json(newResponse);
    } catch (err) {
      logger.error({ err }, "Post canned responses error");
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // DELETE /client/canned-responses/:id
  router.delete("/client/canned-responses/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const [company] = await db.select().from(companiesTable).where(eq(companiesTable.clientId, req.session.userId!)).limit(1);
      if (!company) { res.status(404).json({ error: "No company found" }); return; }
      await db.delete(cannedResponsesTable).where(and(eq(cannedResponsesTable.id, parseInt(id)), eq(cannedResponsesTable.companyId, company.id)));
      res.json({ success: true });
    } catch (err) {
      logger.error({ err }, "Delete canned responses error");
      res.status(500).json({ error: "Internal server error" });
    }
  });
`;

  code = code.replace('export default router;', routes + '\nexport default router;');
  fs.writeFileSync(p, code);
  console.log("Injected canned responses routes");
}
