const fs = require('fs');
let t = fs.readFileSync('artifacts/api-server/src/lib/handoff.ts', 'utf8');

const newPrompt = `

export const METRICS_SYSTEM_PROMPT = \`\\nCRITICAL INSTRUCTION: Analyze the user's latest message and determine their sentiment (positive, neutral, negative, angry) and intent (sales, support, complaint, general). Append EXACTLY this secret JSON block to the END of your response:\\n[METRICS: {"sentiment": "...", "intent": "..."}]\`;

export function extractMetrics(botResponse: string): { cleanResponse: string, metrics: { sentiment?: string, intent?: string } | null } {
  const regex = /\\[METRICS:\\s*(\\{.*?\\})\\s*\\]/s;
  const match = botResponse.match(regex);
  if (match) {
    try {
      const parsed = JSON.parse(match[1]);
      const cleanResponse = botResponse.replace(regex, "").trim();
      return { cleanResponse, metrics: parsed };
    } catch (e) {
      return { cleanResponse: botResponse, metrics: null };
    }
  }
  return { cleanResponse: botResponse, metrics: null };
}
`;

if (!t.includes('METRICS_SYSTEM_PROMPT')) {
  t += newPrompt;
  fs.writeFileSync('artifacts/api-server/src/lib/handoff.ts', t);
}
