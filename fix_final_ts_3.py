import re

# 1. AdminAuditLogs.tsx
with open("artifacts/chatbot-admin/src/pages/admin/AdminAuditLogs.tsx", "r", encoding="utf-8") as f:
    code = f.read()

# Replace all possible forms of api import
code = re.sub(r'import\s+{\s*api\s*}\s+from\s+["\'][^"\']+["\'];', 'import { api } from "../../lib/api";', code)

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

code = re.sub(r'<Mail\s+className="[^"]*"\s*/>', '', code)

with open("artifacts/chatbot-admin/src/pages/client/ClientSettings.tsx", "w", encoding="utf-8") as f:
    f.write(code)

print("Fixed final TS errors again")
