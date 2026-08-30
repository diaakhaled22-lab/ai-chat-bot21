import re

# Update api.ts
with open('lib/api-zod/src/generated/api.ts', 'r', encoding='utf-8') as f:
    api_ts = f.read()

api_ts = api_ts.replace(
    '"newUsername": zod.string().nullish()',
    '"newUsername": zod.string().nullish(),\n  "notificationEmail": zod.string().nullish()'
)

with open('lib/api-zod/src/generated/api.ts', 'w', encoding='utf-8') as f:
    f.write(api_ts)

# Update types.ts
with open('lib/api-zod/src/generated/types.ts', 'r', encoding='utf-8') as f:
    types_ts = f.read()

types_ts = types_ts.replace(
    'newUsername?: string | null;',
    'newUsername?: string | null;\n  notificationEmail?: string | null;'
)

with open('lib/api-zod/src/generated/types.ts', 'w', encoding='utf-8') as f:
    f.write(types_ts)

print("Patched api.ts and types.ts")
