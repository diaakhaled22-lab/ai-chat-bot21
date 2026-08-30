import re

# 1. AdminAuditLogs.tsx
with open("artifacts/chatbot-admin/src/pages/admin/AdminAuditLogs.tsx", "r", encoding="utf-8") as f:
    code = f.read()

code = code.replace(
    'const data = await customFetch("/api/admin/audit-logs");',
    'const data = (await customFetch("/api/admin/audit-logs")) as any[];'
)

with open("artifacts/chatbot-admin/src/pages/admin/AdminAuditLogs.tsx", "w", encoding="utf-8") as f:
    f.write(code)


# 2. Translations.ts
with open("artifacts/chatbot-admin/src/i18n/translations.ts", "r", encoding="utf-8") as f:
    lines = f.read().split("\n")

new_lines = []
for i in range(len(lines)):
    line = lines[i]
    # Check if the NEXT line has the exact same key
    if i < len(lines) - 1:
        match_current = re.search(r'^\s*([a-zA-Z0-9_]+)\s*:', line)
        match_next = re.search(r'^\s*([a-zA-Z0-9_]+)\s*:', lines[i+1])
        if match_current and match_next and match_current.group(1) == match_next.group(1):
            # It's a duplicate. We want to keep the next one (English) and drop this one (Arabic).
            continue
    new_lines.append(line)

with open("artifacts/chatbot-admin/src/i18n/translations.ts", "w", encoding="utf-8") as f:
    f.write("\n".join(new_lines))

print("Fixed")
