import re

with open("artifacts/chatbot-admin/src/App.tsx", "r", encoding="utf-8") as f:
    code = f.read()

if "AdminAuditLogs" not in code:
    code = code.replace(
        'import AdminSecurity from "@/pages/admin/AdminSecurity";',
        'import AdminSecurity from "@/pages/admin/AdminSecurity";\nimport AdminAuditLogs from "@/pages/admin/AdminAuditLogs";'
    )
    
    code = code.replace(
        '<Route path="/admin/security">\n        {() => <ProtectedRoute component={AdminSecurity} allowedRole="admin" />}\n      </Route>',
        '<Route path="/admin/security">\n        {() => <ProtectedRoute component={AdminSecurity} allowedRole="admin" />}\n      </Route>\n      <Route path="/admin/audit-logs">\n        {() => <ProtectedRoute component={AdminAuditLogs} allowedRole="admin" />}\n      </Route>'
    )

with open("artifacts/chatbot-admin/src/App.tsx", "w", encoding="utf-8") as f:
    f.write(code)

print("Added Audit Logs route")
