const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../artifacts/chatbot-admin/src/components/layout/DashboardLayout.tsx');
if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');

    // 1. Add min-w-0 to main
    content = content.replace(
        /<main className="flex-1 flex flex-col overflow-hidden">/g,
        '<main className="flex-1 flex flex-col overflow-hidden min-w-0">'
    );

    // 2. Change p-8 to p-4 md:p-8
    content = content.replace(
        /<div className="flex-1 overflow-y-auto p-8">/g,
        '<div className="flex-1 overflow-y-auto p-4 md:p-8">'
    );

    fs.writeFileSync(filePath, content, 'utf8');
    console.log("Patched DashboardLayout.tsx");
}
