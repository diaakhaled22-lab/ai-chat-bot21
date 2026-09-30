const fs = require('fs');
let code = fs.readFileSync('artifacts/chatbot-admin/src/pages/client/ClientDashboard.tsx', 'utf8');

const searchStr = `            </div>
          )}

          {/* Empty state when no messages */}`;

const replaceStr = `            </div>
          )}

          {/* Sentiment Analysis Card */}
          {data.sentiments && (data.sentiments.positive + data.sentiments.neutral + data.sentiments.negative + data.sentiments.angry > 0) && (
            <div className="grid gap-4 md:grid-cols-2 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium flex items-center">
                    {lang === "ar" ? "OO-U,USO, UO_OO O O U,O OU,OO" (OU,OUOO" O O,OO_O_U+OO O_US)" : "Customer Sentiment (AI)"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col items-center justify-center h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: lang === "ar" ? "OUSO-OO O_" : "Positive", value: data.sentiments.positive, color: "#10b981" },
                          { name: lang === "ar" ? "UO-OUSO_" : "Neutral", value: data.sentiments.neutral, color: "#94a3b8" },
                          { name: lang === "ar" ? "O3U,O O_" : "Negative", value: data.sentiments.negative, color: "#f59e0b" },
                          { name: lang === "ar" ? "O*OO_" : "Angry", value: data.sentiments.angry, color: "#ef4444" },
                        ].filter(d => d.value > 0)}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label
                      >
                        {
                          [
                            { name: "Positive", value: data.sentiments.positive, color: "#10b981" },
                            { name: "Neutral", value: data.sentiments.neutral, color: "#94a3b8" },
                            { name: "Negative", value: data.sentiments.negative, color: "#f59e0b" },
                            { name: "Angry", value: data.sentiments.angry, color: "#ef4444" }
                          ].filter(d => d.value > 0).map((entry, index) => (
                            <Cell key={\`cell-\${index}\`} fill={entry.color} />
                          ))
                        }
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Empty state when no messages */}`;

if (code.includes(searchStr)) {
  code = code.replace(searchStr, replaceStr);
  fs.writeFileSync('artifacts/chatbot-admin/src/pages/client/ClientDashboard.tsx', code);
  console.log("Injected Sentiment Card into ClientDashboard.tsx");
} else {
  console.log("Could not find insertion point!");
}
