import re

with open("artifacts/chatbot-admin/src/pages/client/ClientPrompts.tsx", "r", encoding="utf-8") as f:
    code = f.read()

code = code.replace(
    '{ data: { ...company, systemPrompt: data.systemPrompt || null } }',
    '{ data: { name: company.name, systemPrompt: data.systemPrompt || null } as any }'
)

with open("artifacts/chatbot-admin/src/pages/client/ClientPrompts.tsx", "w", encoding="utf-8") as f:
    f.write(code)

print("Fixed!")
