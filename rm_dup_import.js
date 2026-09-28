const fs = require('fs');

let content = fs.readFileSync('artifacts/chatbot-admin/src/pages/admin/AdminClients.tsx', 'utf8');

// There are two imports of ConfirmDeleteDialog
const importStr = 'import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";\n';
const firstIndex = content.indexOf(importStr);
if (firstIndex !== -1) {
  const nextIndex = content.indexOf(importStr, firstIndex + importStr.length);
  if (nextIndex !== -1) {
    // Duplicate found, remove the second one
    content = content.substring(0, nextIndex) + content.substring(nextIndex + importStr.length);
    fs.writeFileSync('artifacts/chatbot-admin/src/pages/admin/AdminClients.tsx', content);
    console.log('Removed duplicate import');
  }
}
