const fs = require('fs');
let t = fs.readFileSync('artifacts/chatbot-admin/src/pages/client/ClientChatLogs.tsx', 'utf8');

// The starting tag for the retention policy banner is:
// <CardContent className="p-6 pt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
// I will replace it with a standard div
t = t.replace('<CardContent className="p-6 pt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">', '<div className="p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">');

// I also need to replace the FIRST </CardContent> that comes after it, before "Mini Analytics"
t = t.replace('        </CardContent>\n      </Card>\n\n      {/* Mini Analytics', '        </div>\n      </Card>\n\n      {/* Mini Analytics');

fs.writeFileSync('artifacts/chatbot-admin/src/pages/client/ClientChatLogs.tsx', t, 'utf8');
