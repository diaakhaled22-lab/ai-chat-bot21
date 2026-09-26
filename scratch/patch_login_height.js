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
        
        // Use exact height so it doesn't grow beyond the body and get clipped
        content = content.replace(
            /min-h-\[100dvh\]/g,
            'h-[100dvh]'
        );
        
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log("Patched exact height issue in:", path.basename(fullPath));
    }
});
