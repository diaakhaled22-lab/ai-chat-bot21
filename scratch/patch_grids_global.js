const fs = require('fs');
const path = require('path');

const filesToPatch = [
    '../artifacts/chatbot-admin/src/pages/client/ClientUsage.tsx',
    '../artifacts/chatbot-admin/src/pages/client/ClientDashboard.tsx',
    '../artifacts/chatbot-admin/src/pages/admin/AdminCompanies.tsx'
];

filesToPatch.forEach(relPath => {
    const fullPath = path.join(__dirname, relPath);
    if (fs.existsSync(fullPath)) {
        let content = fs.readFileSync(fullPath, 'utf8');
        
        // Globally replace
        content = content.replace(/grid grid-cols-2 lg:grid-cols-4/g, 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4');
        
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log("Global patched grid in:", path.basename(fullPath));
    }
});
