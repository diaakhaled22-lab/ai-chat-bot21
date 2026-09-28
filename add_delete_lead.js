const fs = require('fs');

let content = fs.readFileSync('artifacts/api-server/src/routes/client.ts', 'utf8');

const deleteEndpoint = `
router.delete("/client/leads/:id", async (req, res) => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Client access required" });
    return;
  }
  try {
    const [company] = await db.select().from(companiesTable).where(eq(companiesTable.clientId, req.session.userId));
    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }
    const leadId = parseInt(req.params.id);
    if (isNaN(leadId)) {
      res.status(400).json({ error: "Invalid lead ID" });
      return;
    }
    const [lead] = await db.select().from(leadsTable).where(and(eq(leadsTable.id, leadId), eq(leadsTable.companyId, company.id)));
    if (!lead) {
      res.status(404).json({ error: "Lead not found" });
      return;
    }
    await db.delete(leadsTable).where(eq(leadsTable.id, leadId));
    res.json({ success: true });
  } catch (err: any) {
    logger.error("Error deleting lead:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
`;

if (!content.includes('router.delete("/client/leads/:id"')) {
  content = content.replace(
    /router\.get\("\/client\/leads", async \(req, res\) => \{[\s\S]*?res\.status\(500\)\.json\(\{ error: "Internal server error" \}\);\n  \}\n\}\);/,
    match => match + '\n' + deleteEndpoint
  );
  fs.writeFileSync('artifacts/api-server/src/routes/client.ts', content);
  console.log("Added DELETE endpoint.");
} else {
  console.log("Endpoint already exists.");
}
