const fs = require('fs');
const path = require('path');

const files = [
    '../artifacts/chatbot-admin/src/components/QuotaAICard.tsx',
    '../artifacts/chatbot-admin/src/components/SupportAICard.tsx',
    '../artifacts/chatbot-admin/src/pages/admin/AdminSettings.tsx'
];

files.forEach(filePath => {
    const fullPath = path.join(__dirname, filePath);
    if (!fs.existsSync(fullPath)) return;
    
    let content = fs.readFileSync(fullPath, 'utf8');

    // Patch ModelPicker provider tabs
    content = content.replace(
        /className="flex gap-1 p-1 bg-muted\/40 rounded-lg border border-border\/50"/g,
        'className="flex gap-1 p-1 bg-muted/40 rounded-lg border border-border/50 overflow-x-auto scrollbar-hide"'
    );
    
    // Ensure the buttons don't shrink
    content = content.replace(
        /className={`flex-1 py-1\.5 px-2 text-xs font-semibold rounded-md transition-all \${/g,
        'className={`flex-1 py-1.5 px-2 text-xs font-semibold rounded-md transition-all whitespace-nowrap shrink-0 ${'
    );

    fs.writeFileSync(fullPath, content, 'utf8');
});

// Patch AdminAITester.tsx
const testerPath = path.join(__dirname, '../artifacts/chatbot-admin/src/pages/admin/AdminAITester.tsx');
if (fs.existsSync(testerPath)) {
    let content = fs.readFileSync(testerPath, 'utf8');
    content = content.replace(
        /className="flex gap-0 border-b border-border"/g,
        'className="flex gap-0 border-b border-border overflow-x-auto scrollbar-hide max-w-full"'
    );
    // Button already has whitespace-nowrap, but ensure it doesn't shrink
    content = content.replace(
        /transition-colors -mb-px whitespace-nowrap/g,
        'transition-colors -mb-px whitespace-nowrap shrink-0'
    );
    fs.writeFileSync(testerPath, content, 'utf8');
}

console.log("Patched ModelPicker tabs");
