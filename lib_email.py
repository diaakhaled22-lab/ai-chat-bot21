import re

with open('artifacts/api-server/src/lib/email.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Add a function to send a client notification email
new_func = """
export async function sendClientNotification(clientEmail: string, title: string, messageText: string) {
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
      <div style="background-color: #3b82f6; padding: 20px; color: white;">
        <h2 style="margin: 0;">New Notification</h2>
      </div>
      <div style="padding: 20px;">
        <p style="font-size: 16px; margin-bottom: 8px;"><strong>${title}</strong></p>
        <p style="font-size: 14px; color: #4b5563; line-height: 1.5; margin-bottom: 20px;">
          ${messageText.replace(/\\n/g, "<br>")}
        </p>
        <p style="font-size: 14px; margin-bottom: 20px;">
          Please check the Mission Control client portal for more details.
        </p>
      </div>
    </div>
  `;

  await sendEmail(clientEmail, `[Notification] ${title}`, html);
}
"""

if "sendClientNotification" not in content:
    content += "\n" + new_func

with open('artifacts/api-server/src/lib/email.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print("Added sendClientNotification to email.ts")
