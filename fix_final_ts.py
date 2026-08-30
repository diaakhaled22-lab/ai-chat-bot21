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

# 4. Translations.ts
with open("artifacts/chatbot-admin/src/i18n/translations.ts", "r", encoding="utf-8") as f:
    code = f.read()

# We will parse the file and keep only the LAST occurrence of each key
# It's an object literal, so let's extract all key-value pairs
import sys
lines = code.split('\n')
new_lines = []
keys_seen = set()

# Reverse iterate to keep the last occurrence of the keys
for line in reversed(lines):
    match = re.search(r'^\s*([a-zA-Z0-9_]+)\s*:', line)
    if match:
        key = match.group(1)
        if key in keys_seen:
            continue
        keys_seen.add(key)
    new_lines.append(line)

new_lines.reverse()

with open("artifacts/chatbot-admin/src/i18n/translations.ts", "w", encoding="utf-8") as f:
    f.write("\n".join(new_lines))

print("Fixed final TS errors")
