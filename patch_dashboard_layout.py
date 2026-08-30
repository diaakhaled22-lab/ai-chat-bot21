import re

with open("artifacts/chatbot-admin/src/components/layout/DashboardLayout.tsx", "r", encoding="utf-8") as f:
    code = f.read()

replacement = """    { href: "/admin/ai-tester",          label: "AI Tester",          icon: Sparkles },
    { href: "/admin/audit-logs",         label: "Audit Logs",         icon: ShieldAlert },
    { href: "/admin/security",           label: "Security Settings",           icon: ShieldCheck },"""

if "Audit Logs" not in code:
    code = code.replace(
        '    { href: "/admin/ai-tester",          label: "AI Tester",          icon: Sparkles },\n    { href: "/admin/security",           label: "Security Settings",           icon: ShieldCheck },',
        replacement
    )
    # Add ShieldAlert icon
    if "ShieldAlert" not in code:
        code = code.replace(
            'ShieldCheck,',
            'ShieldCheck, ShieldAlert,'
        )

with open("artifacts/chatbot-admin/src/components/layout/DashboardLayout.tsx", "w", encoding="utf-8") as f:
    f.write(code)

print("Added Audit Logs link")
