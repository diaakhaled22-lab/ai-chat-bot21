import re

with open("artifacts/chatbot-admin/src/pages/admin/AdminDashboard.tsx", "r", encoding="utf-8") as f:
    code = f.read()

# Add AdminActivityLog to imports
code = code.replace(
    'CompanyActivityLog,',
    'CompanyActivityLog,\n  AdminActivityLog,'
)

# Add adminActivityLogs to DashboardData
code = code.replace(
    '  activityLogs: CompanyActivityLog[];\n};',
    '  activityLogs: CompanyActivityLog[];\n  adminActivityLogs: AdminActivityLog[];\n};'
)

with open("artifacts/chatbot-admin/src/pages/admin/AdminDashboard.tsx", "w", encoding="utf-8") as f:
    f.write(code)

print("Patched AdminDashboard.tsx")
