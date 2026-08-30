import re

with open("artifacts/chatbot-admin/src/pages/admin/AdminAuditLogs.tsx", "r", encoding="utf-8") as f:
    code = f.read()

code = code.replace(
    'import { api } from "../../lib/api";',
    'import { customFetch } from "@workspace/api-client-react";'
)
code = code.replace(
    'const { data } = await api.getAdminAuditLogs();\n      return data;',
    'const data = await customFetch("/api/admin/audit-logs");\n      return data;'
)

with open("artifacts/chatbot-admin/src/pages/admin/AdminAuditLogs.tsx", "w", encoding="utf-8") as f:
    f.write(code)


with open("artifacts/chatbot-admin/src/pages/client/ClientPrompts.tsx", "r", encoding="utf-8") as f:
    code = f.read()

code = re.sub(
    r'{\s*data:\s*{\s*systemPrompt:\s*data\.systemPrompt\s*\|\|\s*null\s*}\s*}',
    '{ data: { ...company, systemPrompt: data.systemPrompt || null } }',
    code
)

with open("artifacts/chatbot-admin/src/pages/client/ClientPrompts.tsx", "w", encoding="utf-8") as f:
    f.write(code)


print("Fixed!")
