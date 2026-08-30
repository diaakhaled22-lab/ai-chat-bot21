import re

# 1. AdminAuditLogs.tsx
with open("artifacts/chatbot-admin/src/pages/admin/AdminAuditLogs.tsx", "r", encoding="utf-8") as f:
    code = f.read()

code = code.replace(
    'import { api } from "../../lib/api";',
    'import { api } from "@/lib/api";'
)

with open("artifacts/chatbot-admin/src/pages/admin/AdminAuditLogs.tsx", "w", encoding="utf-8") as f:
    f.write(code)


# 2. ClientPrompts.tsx
with open("artifacts/chatbot-admin/src/pages/client/ClientPrompts.tsx", "r", encoding="utf-8") as f:
    code = f.read()

code = re.sub(r'\s*systemPrompt: data\.systemPrompt,', '', code)

with open("artifacts/chatbot-admin/src/pages/client/ClientPrompts.tsx", "w", encoding="utf-8") as f:
    f.write(code)


# 3. ClientSettings.tsx
with open("artifacts/chatbot-admin/src/pages/client/ClientSettings.tsx", "r", encoding="utf-8") as f:
    code = f.read()

code = re.sub(r'<Mail className="w-4 h-4 mr-2" />', '', code)

with open("artifacts/chatbot-admin/src/pages/client/ClientSettings.tsx", "w", encoding="utf-8") as f:
    f.write(code)

# 4. DashboardLayout.tsx - Missing ShieldAlert import
with open("artifacts/chatbot-admin/src/components/layout/DashboardLayout.tsx", "r", encoding="utf-8") as f:
    code = f.read()

code = code.replace(
    'ShieldCheck,',
    'ShieldCheck, ShieldAlert,'
)

with open("artifacts/chatbot-admin/src/components/layout/DashboardLayout.tsx", "w", encoding="utf-8") as f:
    f.write(code)

print("Fixed final TS errors")
