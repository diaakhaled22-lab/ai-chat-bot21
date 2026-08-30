import re

with open("artifacts/chatbot-admin/src/pages/client/ClientSettings.tsx", "r", encoding="utf-8") as f:
    code = f.read()

# Make sure Mail is imported or remove its usage entirely
code = code.replace(
    'import { Loader2, Plus, Trash2 } from "lucide-react";',
    'import { Loader2, Plus, Trash2, Mail } from "lucide-react";'
)

with open("artifacts/chatbot-admin/src/pages/client/ClientSettings.tsx", "w", encoding="utf-8") as f:
    f.write(code)

print("Fixed Mail import")
