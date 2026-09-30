const fs = require('fs');
let code = fs.readFileSync('artifacts/chatbot-admin/src/pages/client/ClientDashboard.tsx', 'utf8');

// Update Interface
if (!code.includes('sentiments: {')) {
  code = code.replace(
    'periodLabel: string;',
    'periodLabel: string;\n  sentiments: { positive: number; neutral: number; negative: number; angry: number };\n  intents: Array<{ name: string; count: number }>;'
  );
}

// Add the Sentiment Chart UI
const searchStr = `</CardContent>\n        </Card>\n      </div>\n    </div>`;
const replaceStr = `</CardContent>
        </Card>

        {/* Sentiment Analysis Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center">
              {t("dashboard.sentimentAnalysis", "Customer Sentiment (AI)")}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center h-[300px]">
            {data.sentiments.positive + data.sentiments.neutral + data.sentiments.negative + data.sentiments.angry === 0 ? (
              <p className="text-muted-foreground">{t("dashboard.noSentimentData", "Not enough data yet")}</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: t("sentiment.positive", "Positive"), value: data.sentiments.positive, color: "#10b981" },
                      { name: t("sentiment.neutral", "Neutral"), value: data.sentiments.neutral, color: "#94a3b8" },
                      { name: t("sentiment.negative", "Negative"), value: data.sentiments.negative, color: "#f59e0b" },
                      { name: t("sentiment.angry", "Angry"), value: data.sentiments.angry, color: "#ef4444" },
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
            )}
          </CardContent>
        </Card>
      </div>
    </div>`;

if (code.includes(searchStr)) {
  code = code.replace(searchStr, replaceStr);
  
  // also change the grid layout to accommodate 3 cards in the bottom row maybe?
  // currently it's \`<div className="grid gap-4 md:grid-cols-2">\`
  code = code.replace('<div className="grid gap-4 md:grid-cols-2">', '<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">');
  
}

fs.writeFileSync('artifacts/chatbot-admin/src/pages/client/ClientDashboard.tsx', code);
console.log("Updated ClientDashboard.tsx");
