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
        
        // Remove justify-center and items-center from the main flex container 
        // to prevent top-cutoff when content is taller than viewport.
        content = content.replace(
            /flex flex-col justify-center items-center/g,
            'flex flex-col items-center'
        );
        
        // Add mt-auto mb-auto (or my-auto) to the main inner container 
        // so it centers safely only when there is enough space.
        // The container is `<div className="w-full max-w-md relative z-10">`
        content = content.replace(
            /className="w-full max-w-md relative z-10"/g,
            'className="w-full max-w-md relative z-10 my-auto shrink-0"'
        );
        
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log("Patched flexbox centering issue in:", path.basename(fullPath));
    }
});
