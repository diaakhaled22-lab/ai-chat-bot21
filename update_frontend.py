import re

with open('artifacts/chatbot-admin/src/pages/client/ClientSettings.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Add to formSchema
content = re.sub(
    r'newPassword: z.string\(\).min\(6, "New password must be at least 6 characters"\).optional\(\).or\(z.literal\(""\)\),',
    'newPassword: z.string().min(6, "New password must be at least 6 characters").optional().or(z.literal("")),\\n  notificationEmail: z.string().email("Invalid email").optional().or(z.literal("")),',
    content
)

# Add to defaultValues
content = re.sub(
    r'newPassword: "",',
    'newPassword: "",\\n      notificationEmail: (me as any)?.notificationEmail || "",',
    content
)

# Also me doesn't exist when defaultValues are created statically in some components, let's check if me is available inside useForm.
# Actually we can useEffect to reset form when me is loaded.
content = re.sub(
    r'const form = useForm<z.infer<typeof formSchema>>\(\{\n    resolver: zodResolver\(formSchema\),\n    defaultValues: \{\n      newUsername: "",\n      currentPassword: "",\n      newPassword: "",\n    \},\n  \}\);',
    'const form = useForm<z.infer<typeof formSchema>>({\n    resolver: zodResolver(formSchema),\n    defaultValues: {\n      newUsername: "",\n      currentPassword: "",\n      newPassword: "",\n      notificationEmail: "",\n    },\n  });\n\n  useEffect(() => {\n    if (me) {\n      form.reset({\n        newUsername: "",\n        currentPassword: "",\n        newPassword: "",\n        notificationEmail: (me as any)?.notificationEmail || "",\n      });\n    }\n  }, [me, form]);',
    content
)

# Let's import useEffect if it's missing
if 'useEffect' not in content:
    content = content.replace('import { useState }', 'import { useState, useEffect }')
    if 'useEffect' not in content:
        content = content.replace('import { useForm }', 'import { useEffect } from "react";\nimport { useForm }')

# Add to onSubmit
content = re.sub(
    r'if \(values.newPassword\) data.newPassword = values.newPassword;',
    'if (values.newPassword) data.newPassword = values.newPassword;\n    if (values.notificationEmail !== undefined) data.notificationEmail = values.notificationEmail;',
    content
)

content = re.sub(
    r'form.reset\(\{ newUsername: "", currentPassword: "", newPassword: "" \}\);',
    'form.reset({ newUsername: "", currentPassword: "", newPassword: "", notificationEmail: values.notificationEmail || "" });',
    content
)

# Add field JSX
field_jsx = """
                <FormField
                  control={form.control}
                  name="notificationEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5" /> {lang === "ar" ? "?????? ?????????? ????????? (Gmail)" : "Notification Email (Gmail)"}
                      </FormLabel>
                      <FormControl>
                        <Input placeholder={lang === "ar" ? "???? ???? Gmail ????? ?????????" : "Enter Gmail to receive notifications"} {...field} className="bg-background" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
"""

content = re.sub(
    r'(<div className="border-t border-border pt-4 space-y-4">)',
    field_jsx + r'\n              \1',
    content
)

# Check if Mail icon is imported from lucide-react
if 'Mail' not in content:
    content = content.replace('User,', 'User, Mail,')

with open('artifacts/chatbot-admin/src/pages/client/ClientSettings.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated ClientSettings.tsx")
