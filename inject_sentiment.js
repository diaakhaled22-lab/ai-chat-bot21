const fs = require('fs');
let code = fs.readFileSync('artifacts/api-server/src/routes/client.ts', 'utf8');

// We need to add sentiment to the dashboard logs query
const searchStr = `const logs = await db
      .select({
        customerMessage: chatLogsTable.customerMessage,
        botResponse: chatLogsTable.botResponse,
        channel: chatLogsTable.channel,
        createdAt: chatLogsTable.createdAt,`;
const replaceStr = searchStr + `
        sentiment: chatLogsTable.sentiment,
        intent: chatLogsTable.intent,`;

if (code.includes(searchStr)) {
  code = code.replace(searchStr, replaceStr);
}

// Now we need to process the sentiment data
const searchStr2 = `const byChannelMap: Record<string, { messages: number; inputTokens: number; outputTokens: number }> = {};`;
const replaceStr2 = searchStr2 + `
    const sentiments = { positive: 0, neutral: 0, negative: 0, angry: 0 };
    const intents: Record<string, number> = {};
`;

if (code.includes(searchStr2)) {
  code = code.replace(searchStr2, replaceStr2);
}

const searchStr3 = `byChannelMap[l.channel].messages++;`;
const replaceStr3 = searchStr3 + `
      
      if (l.sentiment) {
        const s = l.sentiment.toLowerCase();
        if (s.includes("pos")) sentiments.positive++;
        else if (s.includes("neu")) sentiments.neutral++;
        else if (s.includes("neg")) sentiments.negative++;
        else if (s.includes("ang")) sentiments.angry++;
      }
      
      if (l.intent) {
        const i = l.intent.toLowerCase();
        intents[i] = (intents[i] || 0) + 1;
      }
`;

if (code.includes(searchStr3)) {
  code = code.replace(searchStr3, replaceStr3);
}

const searchStr4 = `byChannel: Object.entries(byChannelMap).map(([channel, d]) => ({ channel, ...d })),`;
const replaceStr4 = searchStr4 + `
        sentiments,
        intents: Object.entries(intents).map(([name, count]) => ({ name, count })).sort((a,b)=>b.count-a.count),`;

if (code.includes(searchStr4)) {
  code = code.replace(searchStr4, replaceStr4);
}

// Same for the empty return
const searchStr5 = `byChannel: [],`;
const replaceStr5 = searchStr5 + `
          sentiments: { positive: 0, neutral: 0, negative: 0, angry: 0 },
          intents: [],`;
if (code.includes(searchStr5)) {
  code = code.replace(searchStr5, replaceStr5);
}

fs.writeFileSync('artifacts/api-server/src/routes/client.ts', code);
console.log("Updated client.ts with sentiment tracking!");
