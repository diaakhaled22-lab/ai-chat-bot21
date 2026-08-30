import re

with open("artifacts/chatbot-admin/src/i18n/translations.ts", "r", encoding="utf-8") as f:
    lines = f.read().split("\n")

new_lines = []
last_key = None

for line in lines:
    match = re.search(r'^\s*([a-zA-Z0-9_]+)\s*:', line)
    if match:
        key = match.group(1)
        if key == last_key:
            # Drop the PREVIOUS line that had this key
            # It should be the last one added to new_lines that matched this key
            # Let's just remove the last line from new_lines
            new_lines.pop()
        last_key = key
    else:
        last_key = None
    new_lines.append(line)

with open("artifacts/chatbot-admin/src/i18n/translations.ts", "w", encoding="utf-8") as f:
    f.write("\n".join(new_lines))

print("Fixed translation file properly")
