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
        
        // Fix grid-cols-2 for stat cards to make them stack on tiny screens
        content = content.replace(
            '<div className="grid grid-cols-2 lg:grid-cols-4 gap-4">',
            '<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">'
        );
        content = content.replace(
            '<div className="grid grid-cols-2 lg:grid-cols-4 gap-3">',
            '<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">'
        );
        
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log("Patched grid in:", path.basename(fullPath));
    }
});
