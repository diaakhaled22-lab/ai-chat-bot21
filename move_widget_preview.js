const fs = require('fs');
let lines = fs.readFileSync('artifacts/chatbot-admin/src/components/layout/DashboardLayout.tsx', 'utf8').split('\n');

let previewIndex = -1;
let malfunctionsIndex = -1;

// Find indexes inside clientLinks array specifically
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('href: "/client/widget-preview"')) {
    previewIndex = i;
  }
  if (lines[i].includes('href: "/client/malfunctions"')) {
    malfunctionsIndex = i;
  }
}

if (previewIndex !== -1 && malfunctionsIndex !== -1) {
  const previewLine = lines.splice(previewIndex, 1)[0];
  
  // Re-find malfunctionsIndex because array changed
  let newMalfunctionsIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('href: "/client/malfunctions"')) {
      newMalfunctionsIndex = i;
    }
  }

  lines.splice(newMalfunctionsIndex, 0, previewLine);
  
  fs.writeFileSync('artifacts/chatbot-admin/src/components/layout/DashboardLayout.tsx', lines.join('\n'));
  console.log("Moved successfully.");
} else {
  console.log("Failed to find lines. previewIndex:", previewIndex, "malfunctionsIndex:", malfunctionsIndex);
}
