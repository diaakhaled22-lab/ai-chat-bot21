import re

# ClientPrompts.tsx
with open("artifacts/chatbot-admin/src/pages/client/ClientPrompts.tsx", "r", encoding="utf-8") as f:
    code = f.read()

# Replace `systemPrompt: data.systemPrompt || null` with `data: { systemPrompt: data.systemPrompt || null }`
# BUT wait! If it's already inside `updateCompanyMutation.mutate( { systemPrompt: ... } )`, I need to wrap it.
code = code.replace(
    '{\n          systemPrompt: data.systemPrompt || null,\n        }',
    '{\n          data: { systemPrompt: data.systemPrompt || null }\n        }'
)
code = code.replace(
    '{\n        systemPrompt: data.systemPrompt || null,\n      }',
    '{\n        data: { systemPrompt: data.systemPrompt || null }\n      }'
)
code = code.replace(
    'systemPrompt: data.systemPrompt || null,',
    'data: { systemPrompt: data.systemPrompt || null }'
)

with open("artifacts/chatbot-admin/src/pages/client/ClientPrompts.tsx", "w", encoding="utf-8") as f:
    f.write(code)


# AdminAuditLogs.tsx
with open("artifacts/chatbot-admin/src/pages/admin/AdminAuditLogs.tsx", "r", encoding="utf-8") as f:
    code = f.read()

# Make sure it's ../../lib/api
code = code.replace('import { api } from "@/lib/api";', 'import { api } from "../../lib/api";')

with open("artifacts/chatbot-admin/src/pages/admin/AdminAuditLogs.tsx", "w", encoding="utf-8") as f:
    f.write(code)

print("Fixed")
