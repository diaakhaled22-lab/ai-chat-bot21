import re

with open('artifacts/api-server/src/routes/client.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Add notificationEmail to the extracted body fields and updates
content = re.sub(
    r'const { newUsername, currentPassword, newPassword } = req.body;',
    'const { newUsername, currentPassword, newPassword, notificationEmail } = req.body;',
    content
)

content = re.sub(
    r'if \(newUsername\?\.trim\(\)\) updates.username = newUsername.trim\(\);',
    'if (newUsername?.trim()) updates.username = newUsername.trim();\n    if (notificationEmail !== undefined) updates.notificationEmail = notificationEmail ? notificationEmail.trim() : null;',
    content
)

with open('artifacts/api-server/src/routes/client.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated client.ts")
