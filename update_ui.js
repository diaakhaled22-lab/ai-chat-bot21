const fs = require('fs');
let t = fs.readFileSync('artifacts/chatbot-admin/src/pages/client/ClientChatLogs.tsx', 'utf8');

if (!t.includes('import { Badge }')) {
  t = t.replace('import { Button }', 'import { Badge } from "@/components/ui/badge";\nimport { Button }');
}

if (!t.includes('Smile')) {
  t = t.replace('} from "lucide-react";', '  Smile, Frown, Meh, Angry,\n} from "lucide-react";');
}

// Add sentiment/intent rendering logic inside the chat message bubble
const badgeRender = `
                  <div className="mt-2 flex flex-wrap gap-2">
                    {msg.customerMessage && msg.sentiment && (
                      <Badge variant="outline" className={\`text-xs \${msg.sentiment === "positive" ? "border-green-500 text-green-500 bg-green-500/10" : msg.sentiment === "negative" ? "border-orange-500 text-orange-500 bg-orange-500/10" : msg.sentiment === "angry" ? "border-red-500 text-red-500 bg-red-500/10" : "border-gray-500 text-gray-500 bg-gray-500/10"}\`}>
                        {msg.sentiment === "positive" && <Smile className="w-3 h-3 mr-1" />}
                        {msg.sentiment === "negative" && <Frown className="w-3 h-3 mr-1" />}
                        {msg.sentiment === "angry" && <Angry className="w-3 h-3 mr-1" />}
                        {(msg.sentiment === "neutral" || !["positive", "negative", "angry"].includes(msg.sentiment)) && <Meh className="w-3 h-3 mr-1" />}
                        {msg.sentiment}
                      </Badge>
                    )}
                    {msg.customerMessage && msg.intent && (
                      <Badge variant="secondary" className="text-xs bg-primary/10 text-primary border-primary/20">
                        {msg.intent}
                      </Badge>
                    )}
                  </div>
`;

// It might be inserted multiple times if we run this script multiple times. 
// We should check if it exists.
if (!t.includes('msg.sentiment &&')) {
  t = t.replace('<p className="text-sm whitespace-pre-wrap">{msg.customerMessage || msg.botResponse}</p>', '<p className="text-sm whitespace-pre-wrap">{msg.customerMessage || msg.botResponse}</p>' + badgeRender);
}

fs.writeFileSync('artifacts/chatbot-admin/src/pages/client/ClientChatLogs.tsx', t);
