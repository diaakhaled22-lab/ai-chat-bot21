import re

with open("artifacts/api-server/src/routes/admin.ts", "r", encoding="utf-8") as f:
    code = f.read()

endpoint = """
// GET /admin/audit-logs
router.get("/admin/audit-logs", requireAdmin, async (req, res) => {
  try {
    const logs = await db
      .select()
      .from(adminActivityLogsTable)
      .orderBy(desc(adminActivityLogsTable.createdAt))
      .limit(100);

    res.json(logs);
  } catch (err) {
    logger.error({ err }, "Get audit logs error");
    res.status(500).json({ error: "Internal server error" });
  }
});
"""

if "GET /admin/audit-logs" not in code:
    code = code.replace(
        'export default router;',
        f"{endpoint}\nexport default router;"
    )

if "adminActivityLogsTable" not in code:
    code = code.replace(
        'companyActivityLogsTable, notificationsTable } from "@workspace/db";',
        'companyActivityLogsTable, notificationsTable, adminActivityLogsTable } from "@workspace/db";'
    )

with open("artifacts/api-server/src/routes/admin.ts", "w", encoding="utf-8") as f:
    f.write(code)

print("Added audit logs endpoint to admin.ts")
