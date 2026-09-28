const fs = require('fs');
let lines = fs.readFileSync('artifacts/chatbot-admin/src/components/layout/DashboardLayout.tsx', 'utf8').split('\n');

let chatIndex = -1;
let previewIndex = -1;

// Find indexes inside clientLinks array specifically
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('href: "/client/universal-chat"')) {
    chatIndex = i;
  }
  if (lines[i].includes('href: "/client/widget-preview"')) {
    previewIndex = i;
  }
}

if (chatIndex !== -1 && previewIndex !== -1) {
  const chatLine = lines.splice(chatIndex, 1)[0];
  
  // Re-find previewIndex because array changed
  let newPreviewIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('href: "/client/widget-preview"')) {
      newPreviewIndex = i;
    }
  }

  lines.splice(newPreviewIndex, 0, chatLine);
  
  fs.writeFileSync('artifacts/chatbot-admin/src/components/layout/DashboardLayout.tsx', lines.join('\n'));
  console.log("Moved successfully.");
} else {
  console.log("Failed to find lines. chatIndex:", chatIndex, "previewIndex:", previewIndex);
}
