const fs = require('fs');
const path = require('path');

const clientLogPath = path.join(__dirname, '../artifacts/chatbot-admin/src/pages/client/ClientChatLogs.tsx');
const adminLogPath = path.join(__dirname, '../artifacts/chatbot-admin/src/pages/admin/AdminChatLogs.tsx');

function patchFile(filePath) {
    if (!fs.existsSync(filePath)) {
        console.log("File not found:", filePath);
        return;
    }
    let content = fs.readFileSync(filePath, 'utf8');

    // Make header responsive
    content = content.replace(
        '<div className="flex items-center justify-between shrink-0">',
        '<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shrink-0">'
    );

    // Make filters container responsive
    content = content.replace(
        '{/* Filters */}\n      <div className="flex gap-4 shrink-0">',
        '{/* Filters */}\n      <div className="flex flex-col md:flex-row gap-4 shrink-0">'
    );

    // Fix select widths in filters
    content = content.replace(
        '<div className="w-[200px]">',
        '<div className="w-full md:w-[200px]">'
    );
    content = content.replace(
        '<div className="w-[220px]">',
        '<div className="w-full md:w-[220px]">'
    );

    // Make Left pane hide on mobile if session selected
    content = content.replace(
        '<div className="w-1/3 border-r border-border flex flex-col bg-muted/10">',
        '<div className={`w-full md:w-1/3 border-r border-border flex-col bg-muted/10 ${selectedSessionId ? \'hidden md:flex\' : \'flex\'}`}>'
    );

    // Make Right pane hide on mobile if no session selected
    content = content.replace(
        '<div className="flex-1 flex flex-col bg-card relative">',
        '<div className={`flex-1 flex-col bg-card relative ${!selectedSessionId ? \'hidden md:flex\' : \'flex\'}`}>'
    );

    // Add back button to the active chat header
    // In ClientChatLogs it's selectedSession, in AdminChatLogs it might be selectedSession or session
    const backBtnCode = `
                    <button 
                      onClick={() => setSelectedSessionId(null)}
                      className="md:hidden p-2 -ml-2 text-muted-foreground hover:text-foreground"
                      title="Back to list"
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </button>`;

    if (content.includes('<div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">')) {
         content = content.replace(
            '<div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">',
            backBtnCode + '\n                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">'
         );
    }
    
    // Make sure ArrowLeft is imported
    if (content.includes('import {') && !content.includes('ArrowLeft')) {
        content = content.replace('import {', 'import { ArrowLeft,');
    }

    fs.writeFileSync(filePath, content, 'utf8');
    console.log("Patched:", path.basename(filePath));
}

patchFile(clientLogPath);
patchFile(adminLogPath);
