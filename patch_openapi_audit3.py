import re

with open("lib/api-spec/openapi.yaml", "r", encoding="utf-8") as f:
    code = f.read()

schema = """  AdminActivityLog:
    type: object
    properties:
      id:
        type: integer
      adminId:
        type: integer
      adminUsername:
        type: string
      action:
        type: string
      details:
        type: string
        nullable: true
      ipAddress:
        type: string
        nullable: true
      createdAt:
        type: string
        format: date-time"""

path = """  /admin/audit-logs:
    get:
      summary: Get admin audit logs
      tags:
        - admin
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: "#/components/schemas/AdminActivityLog"
        "401":
          description: Unauthorized"""

if "AdminActivityLog:" not in code:
    code = code.replace(
        'components:\n  schemas:\n',
        f'components:\n  schemas:\n{schema}\n'
    )

if "/admin/audit-logs:" not in code:
    code = code.replace(
        '  /admin/settings:\n',
        f'{path}\n  /admin/settings:\n'
    )

with open("lib/api-spec/openapi.yaml", "w", encoding="utf-8") as f:
    f.write(code)

print("Added audit logs to lib/api-spec/openapi.yaml")
