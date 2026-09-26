const fs = require('fs');
const path = require('path');

const clientCompanyPath = path.join(__dirname, '../artifacts/chatbot-admin/src/pages/client/ClientCompany.tsx');

if (fs.existsSync(clientCompanyPath)) {
    let content = fs.readFileSync(clientCompanyPath, 'utf8');
    
    // Fix AI Providers grid
    content = content.replace(
        '<div className="grid grid-cols-2 sm:grid-cols-4 gap-2">',
        '<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">'
    );
    
    // Fix Architecture flow Knowledge sources grid
    content = content.replace(
        '<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 text-center text-xs">',
        '<div className="grid grid-cols-1 min-[400px]:grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 text-center text-xs">'
    );

    // Fix Architecture flow Channels grid
    content = content.replace(
        '<div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">',
        '<div className="grid grid-cols-1 min-[400px]:grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">'
    );
    
    fs.writeFileSync(clientCompanyPath, content, 'utf8');
    console.log("Patched ClientCompany.tsx grids");
}
