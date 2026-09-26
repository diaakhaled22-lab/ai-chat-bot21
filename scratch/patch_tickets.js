const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../artifacts/chatbot-admin/src/pages/admin/AdminTickets.tsx');
if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');

    // 1. Fix AI model string overflow in TicketCard
    content = content.replace(
        /className={`inline-flex items-center gap-1 px-1\.5 py-0\.5 rounded border text-\[10px\] font-medium \${prov\.color}`}/g,
        'className={`inline-flex min-w-0 max-w-[200px] sm:max-w-xs items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium ${prov.color}`}'
    );
    // Replace `{prov.label} • {ticket.aiModel}` with wrapped versions
    content = content.replace(
        /\{prov\.label\} • \{ticket\.aiModel\}/g,
        '<span className="shrink-0">{prov.label} •</span><span className="truncate">{ticket.aiModel}</span>'
    );

    // 2. Fix FILTERS buttons wrapper to be scrollable
    content = content.replace(
        /className="flex gap-1\.5 shrink-0"/g,
        'className="flex gap-1.5 shrink-0 overflow-x-auto max-w-full scrollbar-hide pb-1"'
    );
    // Ensure buttons don't shrink and keep text on one line
    content = content.replace(
        /className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 \${/g,
        'className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 ${'
    );

    fs.writeFileSync(filePath, content, 'utf8');
    console.log("Patched AdminTickets.tsx");
}
