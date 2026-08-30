import re

with open('openapi.yaml', 'r', encoding='utf-8') as f:
    content = f.read()

replacement = """  UpdateClientSettingsBody:
    type: object
    properties:
      newUsername:
        type: string
      currentPassword:
        type: string
      newPassword:
        type: string
      notificationEmail:
        type: string
    required:
      - currentPassword"""

content = re.sub(
    r'  UpdateClientSettingsBody:\n    type: object\n    properties:\n      newUsername:\n        type: string\n      currentPassword:\n        type: string\n      newPassword:\n        type: string\n    required:\n      - currentPassword',
    replacement,
    content
)

with open('openapi.yaml', 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated openapi.yaml")
