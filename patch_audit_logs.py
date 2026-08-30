import re

with open("artifacts/chatbot-admin/src/pages/admin/AdminAuditLogs.tsx", "r", encoding="utf-8") as f:
    code = f.read()

# Fix the import of `api`
code = code.replace(
    'import { api } from "@/lib/api";',
    'import { api } from "../../lib/api";'
)

# Fix type of `log`
code = code.replace(
    'logs.map((log) => (',
    'logs.map((log: any) => ('
)

with open("artifacts/chatbot-admin/src/pages/admin/AdminAuditLogs.tsx", "w", encoding="utf-8") as f:
    f.write(code)

with open("artifacts/chatbot-admin/src/pages/client/ClientPrompts.tsx", "r", encoding="utf-8") as f:
    code = f.read()

code = code.replace(
    'systemPrompt: data.systemPrompt,',
    ''
)

with open("artifacts/chatbot-admin/src/pages/client/ClientPrompts.tsx", "w", encoding="utf-8") as f:
    f.write(code)

with open("artifacts/chatbot-admin/src/pages/client/ClientSettings.tsx", "r", encoding="utf-8") as f:
    code = f.read()

code = code.replace(
    '<Mail className="w-4 h-4 mr-2" />',
    ''
)

with open("artifacts/chatbot-admin/src/pages/client/ClientSettings.tsx", "w", encoding="utf-8") as f:
    f.write(code)


print("Patched typescript errors")
