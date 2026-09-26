const fs = require('fs');
const path = require('path');

const files = [
  '../artifacts/chatbot-admin/src/pages/client/ClientCompany.tsx',
  '../artifacts/chatbot-admin/src/components/QuotaAICard.tsx',
  '../artifacts/chatbot-admin/src/components/SupportAICard.tsx'
];

files.forEach(relPath => {
  const fullPath = path.join(__dirname, relPath);
  if (!fs.existsSync(fullPath)) return;

  let content = fs.readFileSync(fullPath, 'utf8');

  // Fix 1: Make the text container flex-1 min-w-0
  content = content.replace(
    /<div>\s*<span className="font-medium">/g,
    '<div className="flex-1 min-w-0">\n              <span className="font-medium block">'
  );
  
  // Fix for QuotaAICard/SupportAICard which already had <div className="min-w-0">
  content = content.replace(
    /<div className="min-w-0">\s*<span className="font-medium">/g,
    '<div className="flex-1 min-w-0">\n                      <span className="font-medium block">'
  );

  // Fix 2: Make the model string wrap properly below the main text
  content = content.replace(
    /<span className="ml-2 text-xs text-muted-foreground font-mono">/g,
    '<span className="block mt-1 text-[11px] text-muted-foreground font-mono break-all leading-relaxed">'
  );

  fs.writeFileSync(fullPath, content, 'utf8');
  console.log("Patched AI status layout in:", path.basename(fullPath));
});
