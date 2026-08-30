import re

with open("artifacts/api-server/src/routes/admin.ts", "r", encoding="utf-8") as f:
    code = f.read()

# Add import
if "logAdminActivity" not in code:
    code = code.replace(
        'import { enforceResponseLanguage, getLanguageInstruction } from "../lib/language";',
        'import { enforceResponseLanguage, getLanguageInstruction } from "../lib/language";\nimport { logAdminActivity } from "../lib/audit";'
    )

# 1. Create client
code = re.sub(
    r'(res\.status\(201\)\.json\(\{ ok: true, client: newClient \}\);)',
    r'logAdminActivity(req.session.userId!, "create_client", `Created client ${newUsername}`, req.ip);\n      \1',
    code
)

# 2. Update client
code = re.sub(
    r'(res\.json\(\{ ok: true \}\);\n\s*\} catch \(err\))',
    r'logAdminActivity(req.session.userId!, "update_client", `Updated client ID ${id}`, req.ip);\n      \1',
    code, count=1 # Only first one which is update client
)

# 3. Delete client
code = re.sub(
    r'(res\.json\(\{ ok: true, deleted: true \}\);\n\s*\} catch \(err\))',
    r'logAdminActivity(req.session.userId!, "delete_client", `Deleted client ID ${id}`, req.ip);\n      \1',
    code, count=1
)

# 4. Delete company
code = re.sub(
    r'(logger\.info\(\{ companyId: id \}, "Company and related data deleted"\);\n\s*res\.json\(\{ ok: true, deleted: true \}\);)',
    r'logAdminActivity(req.session.userId!, "delete_company", `Deleted company ID ${id}`, req.ip);\n      \1',
    code
)

# 5. Toggle company status
code = re.sub(
    r'(res\.json\(\{ ok: true, isActive: newStatus, message: `Company \$\{id\} is now \$\{newStatus \? "active" : "inactive"\}`,? \}\);)',
    r'logAdminActivity(req.session.userId!, "toggle_company_status", `Set company ID ${id} to ${newStatus ? "active" : "inactive"}`, req.ip);\n      \1',
    code
)

# 6. Update support settings
code = re.sub(
    r'(res\.json\(\{ ok: true \}\);\n\s*\} catch \(err\))',
    r'logAdminActivity(req.session.userId!, "update_support_settings", "Updated Support AI settings", req.ip);\n      \1',
    code, count=1 # Need to make sure it hits the right one, actually let's use a more specific regex
)

# Actually, replacing `res.json({ ok: true });` blindly will hit multiple places. Let's do it specifically.
code = re.sub(
    r'(logger\.info\(\{ updates: Object\.keys\(updates\) \}, "Admin support settings updated"\);\n\s*res\.json\(\{ ok: true \}\);)',
    r'logAdminActivity(req.session.userId!, "update_support_settings", "Updated Support AI settings", req.ip);\n      \1',
    code
)

# 7. Update email settings
code = re.sub(
    r'(logger\.info\(\{ updates: Object\.keys\(updates\) \}, "Admin email settings updated"\);\n\s*res\.json\(\{ ok: true \}\);)',
    r'logAdminActivity(req.session.userId!, "update_email_settings", "Updated Email settings", req.ip);\n      \1',
    code
)

# 8. Update admin settings
code = re.sub(
    r'(logger\.info\(\{ adminId: req\.session\.userId, changes \}, "Admin settings updated"\);\n\s*res\.json\(\{ ok: true \}\);)',
    r'logAdminActivity(req.session.userId!, "update_admin_settings", `Updated admin profile. Changes: ${changes.join(", ")}`, req.ip);\n      \1',
    code
)

# 9. Broadcast
code = re.sub(
    r'(logger\.info\(\{ count: companies\.length, target: validTarget \}, "Broadcast sent"\);\n\s*res\.json\(\{ sent: companies\.length \}\);)',
    r'logAdminActivity(req.session.userId!, "send_broadcast", `Sent broadcast to ${validTarget} (${companies.length} companies)`, req.ip);\n      \1',
    code
)

with open("artifacts/api-server/src/routes/admin.ts", "w", encoding="utf-8") as f:
    f.write(code)

print("Added audit logs to admin.ts")
