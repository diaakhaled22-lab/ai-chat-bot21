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
        
        // Replace overflow-hidden with overflow-x-hidden overflow-y-auto
        // so users can scroll when the mobile keyboard is open
        content = content.replace(
            /p-4 relative overflow-hidden/g,
            'p-4 py-12 sm:py-4 relative overflow-x-hidden overflow-y-auto'
        );
        // also make sure the container handles flex centering safely
        content = content.replace(
            /min-h-screen flex items-center justify-center/g,
            'min-h-[100dvh] flex flex-col justify-center items-center'
        );
        
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log("Patched scroll issue in:", path.basename(fullPath));
    }
});
