const fs = require('fs');
const path = require('path');

const clientSupportPath = path.join(__dirname, '../artifacts/chatbot-admin/src/pages/client/ClientSupport.tsx');
const adminTicketsPath = path.join(__dirname, '../artifacts/chatbot-admin/src/pages/admin/AdminTickets.tsx');

function patchClientSupport() {
    let content = fs.readFileSync(clientSupportPath, 'utf8');

    // Fix header flex container
    content = content.replace(
        '<div className="flex items-start justify-between gap-4">',
        '<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">'
    );

    // Fix TicketRow meta wrap
    content = content.replace(
        '<div className="flex items-center gap-2">',
        '<div className="flex items-center gap-2 flex-wrap">'
    );

    fs.writeFileSync(clientSupportPath, content, 'utf8');
    console.log("Patched ClientSupport.tsx");
}

function patchAdminTickets() {
    let content = fs.readFileSync(adminTicketsPath, 'utf8');

    // Fix header container
    content = content.replace(
        '<div className="flex items-start justify-between gap-4 flex-wrap">',
        '<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 flex-wrap">'
    );

    // Fix TicketCard Header row layout
    // Original:
    //       <div className="flex items-start gap-3 p-4">
    //         {/* Status icon */}
    content = content.replace(
        '<div className="flex items-start gap-3 p-4">\n        {/* Status icon */}',
        '<div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 p-4">\n        <div className="flex items-start gap-3 flex-1 min-w-0 w-full">\n        {/* Status icon */}'
    );

    // And close the new inner div before action buttons
    // Original:
    //         {/* ── Action buttons (always visible for open tickets) ── */}
    //         <div className="shrink-0 flex items-center gap-2">
    content = content.replace(
        '        {/* ── Action buttons (always visible for open tickets) ── */}\n        <div className="shrink-0 flex items-center gap-2">',
        '        </div>\n\n        {/* ── Action buttons (always visible for open tickets) ── */}\n        <div className="shrink-0 flex items-center gap-2 w-full sm:w-auto justify-end">'
    );

    fs.writeFileSync(adminTicketsPath, content, 'utf8');
    console.log("Patched AdminTickets.tsx");
}

patchClientSupport();
patchAdminTickets();
