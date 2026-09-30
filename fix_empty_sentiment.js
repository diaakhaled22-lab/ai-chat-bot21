const fs = require('fs');
let code = fs.readFileSync('artifacts/chatbot-admin/src/pages/client/ClientDashboard.tsx', 'utf8');

// Replace the strict condition with just data.sentiments so it always shows the card
const searchStr = '{data.sentiments && (data.sentiments.positive + data.sentiments.neutral + data.sentiments.negative + data.sentiments.angry > 0) && (';
const replaceStr = '{data.sentiments && (';

if (code.includes(searchStr)) {
  code = code.replace(searchStr, replaceStr);
  
  // Also add an empty state inside the Card
  const innerSearch = '<ResponsiveContainer width="100%" height="100%">';
  const innerReplace = `
                  {(data.sentiments.positive + data.sentiments.neutral + data.sentiments.negative + data.sentiments.angry) === 0 ? (
                    <div className="flex flex-col items-center justify-center text-muted-foreground gap-2">
                      <BarChart2 className="w-8 h-8 opacity-20" />
                      <p className="text-sm">{lang === "ar" ? "U,O  O*U^O_O_ OUSOU+OO* UO_OO_O OOU,USO, UO_OO_U" : "No sentiment data yet. Chat with the bot!"}</p>
                    </div>
                  ) : (
                  <ResponsiveContainer width="100%" height="100%">`;
                  
  code = code.replace(innerSearch, innerReplace);
  
  // Fix the closing bracket for the ternary operator
  const closeSearch = `</ResponsiveContainer>\n                </CardContent>`;
  const closeReplace = `</ResponsiveContainer>\n                  )}\n                </CardContent>`;
  
  code = code.replace(closeSearch, closeReplace);
  
  // Fix arabic text
  code = code.replace('"U,O  O*U^O_O_ OUSOU+OO* UO_OO_O OOU,USO, UO_OO_U"', '"لا توجد بيانات مشاعر بعد. تحدث مع البوت لتبدأ!"');
  
  fs.writeFileSync('artifacts/chatbot-admin/src/pages/client/ClientDashboard.tsx', code);
  console.log("Updated Dashboard to show empty sentiment card");
}
