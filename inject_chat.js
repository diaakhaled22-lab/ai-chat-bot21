const fs = require('fs');
const p = 'artifacts/chatbot-admin/src/pages/client/ClientUniversalChat.tsx';
let code = fs.readFileSync(p, 'utf8');

// Add Zap import
if (!code.includes('Zap')) {
  code = code.replace('User, Bot, Send, Loader2, CheckCircle2 } from \'lucide-react\';', 'User, Bot, Send, Loader2, CheckCircle2, Zap } from \'lucide-react\';');
}

// Add interface and query
if (!code.includes('interface CannedResponse')) {
  code = code.replace('export default function ClientUniversalChat() {', `
interface CannedResponse {
  id: number;
  companyId: number;
  title: string;
  content: string;
}

export default function ClientUniversalChat() {
`);
}

if (!code.includes('canned-responses')) {
  code = code.replace('const { data: logs, isLoading } = useListClientChatLogs();', `
  const { data: logs, isLoading } = useListClientChatLogs();
  const { data: cannedResponses = [] } = useQuery({
    queryKey: ["canned-responses"],
    queryFn: async () => {
      const { customFetch } = await import("@workspace/api-client-react");
      const res = await customFetch("/client/canned-responses");
      if (!res.ok) return [];
      return (await res.json()) as CannedResponse[];
    }
  });
  
  const showQuickReplies = replyText.startsWith("/");
  const filteredQuickReplies = showQuickReplies ? cannedResponses.filter(r => r.title.toLowerCase().includes(replyText.slice(1).toLowerCase())) : [];
  
  const handleSelectQuickReply = (content: string) => {
    setReplyText(content);
  };
`);
}

// Add the floating UI above the Textarea
const inputSearch = '<div className="flex gap-2 items-end">';
const inputReplace = `
                  {/* Quick Replies Dropdown */}
                  {showQuickReplies && filteredQuickReplies.length > 0 && (
                    <div className="mb-2 bg-popover border border-border rounded-lg shadow-lg overflow-hidden flex flex-col max-h-48 overflow-y-auto">
                      <div className="px-3 py-1.5 bg-muted/50 border-b border-border text-xs font-medium text-muted-foreground flex items-center gap-2">
                        <Zap className="w-3 h-3" />
                        {lang === "ar" ? "اختر رداً سريعاً" : "Select Quick Reply"}
                      </div>
                      {filteredQuickReplies.map(r => (
                        <button
                          key={r.id}
                          onClick={() => handleSelectQuickReply(r.content)}
                          className="flex flex-col text-start px-3 py-2 hover:bg-muted focus:bg-muted transition-colors border-b border-border/50 last:border-0"
                        >
                          <span className="font-medium text-sm text-primary">/{r.title}</span>
                          <span className="text-xs text-muted-foreground truncate w-full">{r.content}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2 items-end">
`;
if (code.includes(inputSearch) && !code.includes('Quick Replies Dropdown')) {
  code = code.replace(inputSearch, inputReplace);
}

fs.writeFileSync(p, code);
console.log("Updated Universal Chat");
