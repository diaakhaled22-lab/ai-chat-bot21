const fs = require('fs');
const path = require('path');

const fixFile = (filePath) => {
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf8');

    // 1. In AdminDashboard.tsx
    content = content.replace(
        /className="flex items-center gap-1 bg-muted\/40 border border-border\/50 rounded-lg p-1"/g,
        'className="flex items-center gap-1 bg-muted/40 border border-border/50 rounded-lg p-1 overflow-x-auto max-w-full scrollbar-hide"'
    );
    // Add whitespace-nowrap shrink-0 to buttons mapped
    content = content.replace(
        /className={`px-3 py-1 text-xs font-medium rounded-md transition-all \${/g,
        'className={`px-3 py-1 text-xs font-medium rounded-md transition-all whitespace-nowrap shrink-0 ${'
    );

    // 2. In ClientUsage.tsx
    content = content.replace(
        /className="flex items-center gap-1\.5 flex-wrap justify-end"/g,
        'className="flex items-center gap-1.5 flex-nowrap overflow-x-auto max-w-full scrollbar-hide justify-start sm:justify-end pb-1"'
    );
    content = content.replace(
        /className={`px-3 py-1\.5 rounded-md text-xs font-medium transition-colors \${/g,
        'className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${'
    );
    content = content.replace(
        /className={`flex items-center gap-1 px-3 py-1\.5 rounded-md text-xs font-medium transition-colors \${/g,
        'className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${'
    );
    
    // 3. AdminAiQuota.tsx / AdminCompanies.tsx
    // (If they use a similar p-1 border rounded-lg pattern for buttons)
    content = content.replace(
        /className="flex items-center gap-2 bg-muted\/40 border border-border\/50 rounded-lg p-1 w-fit"/g,
        'className="flex items-center gap-2 bg-muted/40 border border-border/50 rounded-lg p-1 w-full sm:w-fit overflow-x-auto scrollbar-hide"'
    );
    content = content.replace(
        /className="flex flex-wrap gap-2"/g,
        'className="flex flex-nowrap sm:flex-wrap gap-2 overflow-x-auto sm:overflow-visible pb-1 sm:pb-0 scrollbar-hide w-full max-w-full"'
    );
    // Some buttons might just be raw strings, we inject whitespace-nowrap shrink-0 if they have text-xs font-medium rounded-md
    
    fs.writeFileSync(filePath, content, 'utf8');
};

const dirs = [
    '../artifacts/chatbot-admin/src/pages/admin',
    '../artifacts/chatbot-admin/src/pages/client'
];

dirs.forEach(d => {
    const fullDir = path.join(__dirname, d);
    fs.readdirSync(fullDir).forEach(f => {
        if (f.endsWith('.tsx')) {
            fixFile(path.join(fullDir, f));
        }
    });
});
console.log("Patched filter buttons for mobile layout");
