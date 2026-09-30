const fs = require('fs');
const path = require('path');

// Fix DashboardLayout.tsx overflow
const layoutPath = path.join(__dirname, '../artifacts/chatbot-admin/src/components/layout/DashboardLayout.tsx');
if (fs.existsSync(layoutPath)) {
    let content = fs.readFileSync(layoutPath, 'utf8');
    content = content.replace(
        /<div className="flex-1 overflow-y-auto p-4 md:p-8">/g,
        '<div className="flex-1 overflow-y-auto overflow-x-hidden w-full p-4 md:p-8">'
    );
    fs.writeFileSync(layoutPath, content, 'utf8');
    console.log("Patched DashboardLayout.tsx");
}

// Fix Input min-w-0
const inputPath = path.join(__dirname, '../artifacts/chatbot-admin/src/components/ui/input.tsx');
if (fs.existsSync(inputPath)) {
    let content = fs.readFileSync(inputPath, 'utf8');
    content = content.replace(
        /"flex h-9 w-full rounded-md/g,
        '"flex h-9 w-full min-w-0 rounded-md'
    );
    fs.writeFileSync(inputPath, content, 'utf8');
    console.log("Patched input.tsx");
}

// Fix Textarea min-w-0
const textareaPath = path.join(__dirname, '../artifacts/chatbot-admin/src/components/ui/textarea.tsx');
if (fs.existsSync(textareaPath)) {
    let content = fs.readFileSync(textareaPath, 'utf8');
    content = content.replace(
        /"flex min-h-\[80px\] w-full rounded-md/g,
        '"flex min-h-[80px] w-full min-w-0 rounded-md'
    );
    fs.writeFileSync(textareaPath, content, 'utf8');
    console.log("Patched textarea.tsx");
}
