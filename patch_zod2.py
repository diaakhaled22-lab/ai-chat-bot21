import re

# Update clientSettingsInput.ts
with open('lib/api-zod/src/generated/types/clientSettingsInput.ts', 'r', encoding='utf-8') as f:
    ts = f.read()

ts = ts.replace(
    'newUsername?: string | null;',
    'newUsername?: string | null;\n  notificationEmail?: string | null;'
)

with open('lib/api-zod/src/generated/types/clientSettingsInput.ts', 'w', encoding='utf-8') as f:
    f.write(ts)

print("Patched clientSettingsInput.ts")
