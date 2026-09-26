const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '../artifacts/chatbot-admin/src/pages');

function fixFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;

    // Fix ClientChannels.tsx
    if (filePath.endsWith('ClientChannels.tsx')) {
        const target = 'className="grid grid-cols-4 gap-3 text-center text-xs"';
        const replace = 'className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center text-xs"';
        if (content.includes(target)) {
            content = content.replace(target, replace);
            modified = true;
        }
    }

    // Fix AdminCompanies.tsx modals
    if (filePath.endsWith('AdminCompanies.tsx')) {
        const fixes = [
            {
                target: 'className="grid grid-cols-5 gap-2"',
                replace: 'className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2"'
            },
            {
                target: 'className="grid grid-cols-3 gap-2"',
                replace: 'className="grid grid-cols-1 sm:grid-cols-3 gap-2"'
            },
            {
                target: 'className="grid grid-cols-3 gap-3"',
                replace: 'className="grid grid-cols-1 sm:grid-cols-3 gap-3"'
            }
        ];
        
        for (const fix of fixes) {
            if (content.includes(fix.target)) {
                content = content.replace(fix.target, fix.replace);
                modified = true;
            }
        }
    }
    
    // Fix ClientDashboard.tsx and AdminCompanies.tsx grid-cols-2 to grid-cols-1 sm:grid-cols-2
    // Actually, grid-cols-2 for stat cards (like Total Messages, Total Tokens) is perfectly fine on mobile because the numbers are short. Let's leave them.

    if (modified) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log('Fixed', path.basename(filePath));
    }
}

function traverse(dir) {
    const files = fs.readdirSync(dir);
    for (const f of files) {
        const p = path.join(dir, f);
        if (fs.statSync(p).isDirectory()) {
            traverse(p);
        } else if (p.endsWith('.tsx')) {
            fixFile(p);
        }
    }
}

traverse(srcDir);
console.log('Done.');
