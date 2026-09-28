const fs = require('fs');

const files = [
  'artifacts/chatbot-admin/src/pages/admin/AdminChatLogs.tsx',
  'artifacts/chatbot-admin/src/pages/client/ClientCompany.tsx',
  'artifacts/chatbot-admin/src/pages/admin/AdminClients.tsx',
  'artifacts/chatbot-admin/src/pages/admin/AdminCompanies.tsx',
  'artifacts/chatbot-admin/src/pages/client/ClientKnowledge.tsx',
  'artifacts/chatbot-admin/src/pages/client/ClientUniversalChat.tsx',
  'artifacts/chatbot-admin/src/pages/client/ClientAIChat.tsx'
];

function refactorFile(file) {
  if (!fs.existsSync(file)) {
    console.log(`File not found: ${file}`);
    return;
  }
  let content = fs.readFileSync(file, 'utf8');

  // 1. Add import if not present
  if (!content.includes('ConfirmDeleteDialog')) {
    content = content.replace(
      'import { Input }',
      'import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";\nimport { Input }'
    );
    // If not replaced (no import { Input }), just put it after react imports
    if (!content.includes('ConfirmDeleteDialog')) {
      content = content.replace(
        'import { Button }',
        'import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";\nimport { Button }'
      );
    }
  }

  // 2. Remove typical confirm lines
  content = content.replace(/if\s*\(!confirm\([^)]+\)\)\s*return;/g, '');
  content = content.replace(/if\s*\(confirm\([^)]+\)\)\s*\{\s*delete[A-Za-z0-9_]+\.mutate\([^)]+\);\s*\}/g, (match) => {
    // If it's something like if (confirm("...")) { deleteMutation.mutate(id) }
    // Just extract the content inside the curly braces
    const inner = match.substring(match.indexOf('{') + 1, match.lastIndexOf('}')).trim();
    return inner;
  });

  // 3. We have to wrap buttons manually if they contain Trash2. This is hard to do safely with pure regex because JSX can be nested. 
  // Maybe I'll just write the file and then let my agent tool handle the JSX.
  fs.writeFileSync(file, content, 'utf8');
}

files.forEach(refactorFile);
console.log("Basic confirm removal and import added.");
