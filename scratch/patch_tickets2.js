const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../artifacts/chatbot-admin/src/pages/admin/AdminTickets.tsx');
if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');

    // Replace `{prov.label} · {ticket.aiModel}` with wrapped versions
    content = content.replace(
        /\{prov\.label\} · \{ticket\.aiModel\}/g,
        '<span className="shrink-0">{prov.label} · </span><span className="truncate">{ticket.aiModel}</span>'
    );

    fs.writeFileSync(filePath, content, 'utf8');
    console.log("Patched AdminTickets.tsx middot");
}
