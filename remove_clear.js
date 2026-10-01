const fs = require('fs');
let code = fs.readFileSync('artifacts/chatbot-admin/src/pages/admin/AdminAiQuota.tsx', 'utf8');

code = code.replace(/<Button\s+type="button"\s+size="sm"\s+variant="ghost"\s+className="text-xs h-7 text-muted-foreground"\s+onClick=\{\(\) => setQuotaInput\(""\)\}\s*>\s*<X className="w-3 h-3 mr-1" \/>\s*\{lang === "ar" \? "تعطيل الحصة" : "Clear — Disable Quota"\}\s*<\/Button>/g, '');

code = code.replace(/<Button\s+type="button"\s+size="sm"\s+variant="ghost"\s+className="text-xs h-7 text-muted-foreground"\s+onClick=\{\(\) => setNewAssignQuota\(""\)\}\s*>\s*<X className="w-3 h-3 mr-1" \/>\s*\{lang === "ar" \? "تعطيل الحصة" : "Clear — Disable Quota"\}\s*<\/Button>/g, '');

fs.writeFileSync('artifacts/chatbot-admin/src/pages/admin/AdminAiQuota.tsx', code);
console.log('Removed buttons');
