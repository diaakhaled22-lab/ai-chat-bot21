import re

with open("artifacts/chatbot-admin/src/i18n/translations.ts", "r", encoding="utf-8") as f:
    code = f.read()

# I will use a simple regex to remove duplicate lines that appear right after another line with the same key
# E.g.
#    common_loading: "???? ???????...",
#    common_loading: "Loading...",
# We want to keep the arabic one or whatever, but actually since the user wanted NO ARABIC in the admin, the english one is fine.

lines = code.split("\n")
new_lines = []
seen_keys = set()
for line in lines:
    match = re.search(r'^\s*([a-zA-Z0-9_]+)\s*:', line)
    if match:
        key = match.group(1)
        if key in seen_keys:
            continue
        seen_keys.add(key)
    new_lines.append(line)

with open("artifacts/chatbot-admin/src/i18n/translations.ts", "w", encoding="utf-8") as f:
    f.write("\n".join(new_lines))

print("Fixed translation file")
