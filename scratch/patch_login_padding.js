const fs = require('fs');
const path = require('path');

const filesToPatch = [
    '../artifacts/chatbot-admin/src/pages/auth/ClientLogin.tsx',
    '../artifacts/chatbot-admin/src/pages/auth/AdminLogin.tsx',
    '../artifacts/chatbot-admin/src/pages/auth/ForgotPassword.tsx',
    '../artifacts/chatbot-admin/src/pages/auth/ResetPassword.tsx'
];

filesToPatch.forEach(relPath => {
    const fullPath = path.join(__dirname, relPath);
    if (fs.existsSync(fullPath)) {
        let content = fs.readFileSync(fullPath, 'utf8');
        
        // Increase bottom padding
        content = content.replace(
            /p-4 py-12 sm:py-4/g,
            'p-4 pt-12 pb-24 sm:py-4'
        );
        
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log("Patched bottom padding in:", path.basename(fullPath));
    }
});
