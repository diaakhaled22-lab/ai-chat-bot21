const fs = require('fs');
let code = fs.readFileSync('artifacts/chatbot-admin/src/pages/client/ClientDashboard.tsx', 'utf8');

// Fix the corrupted Arabic strings
code = code.replace('"OO-U,USO, UO_OO O O U,O OU,OO" (OU,OUOO" O O,OO_O_U+OO O_US)"', '"تحليل مشاعر العملاء (ذكاء اصطناعي)"');
code = code.replace('"OUSO-OO O_"', '"إيجابي"');
code = code.replace('"UO-OUSO_"', '"محايد"');
code = code.replace('"O3U,O O_"', '"سلبي"');
code = code.replace('"O*OO_"', '"غاضب"');

fs.writeFileSync('artifacts/chatbot-admin/src/pages/client/ClientDashboard.tsx', code);
console.log("Fixed Arabic strings");
