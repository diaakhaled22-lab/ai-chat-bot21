const fs = require('fs');
const path = require('path');

const clientCompanyPath = path.join(__dirname, '../artifacts/chatbot-admin/src/pages/client/ClientCompany.tsx');

if (fs.existsSync(clientCompanyPath)) {
    let content = fs.readFileSync(clientCompanyPath, 'utf8');
    
    // Fix Telegram Register button
    content = content.replace(
        'className="bg-sky-500 hover:bg-sky-600 text-white gap-2"',
        'className="bg-sky-500 hover:bg-sky-600 text-white gap-2 w-full sm:w-auto h-auto py-2 whitespace-normal"'
    );
    
    fs.writeFileSync(clientCompanyPath, content, 'utf8');
    console.log("Patched Telegram Register button in ClientCompany.tsx");
}
