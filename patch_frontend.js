
const fs = require("fs");

let text = fs.readFileSync("artifacts/chatbot-admin/src/pages/client/ClientChatLogs.tsx", "utf8");

// Add state variables and mutations
const states = `  const [replyMessage, setReplyMessage] = useState("");
  const [isReplying, setIsReplying] = useState(false);
  const queryClient = useQueryClient();

  const handleReply = async () => {
    if (!replyMessage.trim() || !selectedSession) return;
    setIsReplying(true);
    try {
      await fetch("/api/client/chat/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: selectedSession.id,
          channel: selectedSession.channel,
          message: replyMessage
        })
      });
      setReplyMessage("");
      queryClient.invalidateQueries({ queryKey: getListClientChatLogsQueryKey() });
    } finally {
      setIsReplying(false);
    }
  };

  const handleResolve = async () => {
    if (!selectedSession) return;
    try {
      await fetch("/api/client/chat/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: selectedSession.id,
          channel: selectedSession.channel,
        })
      });
      queryClient.invalidateQueries({ queryKey: getListClientChatLogsQueryKey() });
    } catch(e) {}
  };
`;

text = text.replace("const queryClient = useQueryClient();", states);

// Determine handoff state
const handoffState = `
  const isHandoff = useMemo(() => {
    if (!selectedSession) return false;
    for (let i = selectedSession.messages.length - 1; i >= 0; i--) {
      if (selectedSession.messages[i].botResponse === "[HANDOFF_RESOLVED]") return false;
      if (selectedSession.messages[i].isHandoff) return true;
    }
    return false;
  }, [selectedSession]);
`;

text = text.replace("const handleSelectSession = (sessionId: string) => {", handoffState + "\n  const handleSelectSession = (sessionId: string) => {");

// Chat Input Box
const chatInput = `
                  <div className="p-4 border-t border-border/50 bg-muted/20">
                    {isHandoff ? (
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-amber-500">
                            {lang === "ar" ? "??? ???? ?????? ????" : "Human Handoff Active"}
                          </span>
                          <button onClick={handleResolve} className="text-xs bg-amber-500/10 text-amber-500 px-2 py-1 rounded">
                            {lang === "ar" ? "????? ???????? ??????? ?????" : "Resolve & Return to AI"}
                          </button>
                        </div>
                        <div className="flex gap-2">
                          <input 
                            value={replyMessage}
                            onChange={e => setReplyMessage(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && handleReply()}
                            placeholder={lang === "ar" ? "???? ?????? ??????..." : "Type your reply to customer..."}
                            className="flex-1 bg-background border border-input rounded-md px-3 py-2 text-sm"
                          />
                          <button 
                            onClick={handleReply}
                            disabled={isReplying}
                            className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
                          >
                            {lang === "ar" ? "?????" : "Send"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between opacity-50">
                        <span className="text-sm text-muted-foreground">
                          {lang === "ar" ? "?????? ????????? ???? ??? ????????." : "AI is managing this conversation."}
                        </span>
                        <button onClick={async () => {
                          // Trigger takeover manually
                          await fetch("/api/client/chat/reply", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ sessionId: selectedSession.id, channel: selectedSession.channel, message: "?? ?????? ????? ?????." })
                          });
                          queryClient.invalidateQueries({ queryKey: getListClientChatLogsQueryKey() });
                        }} className="text-xs text-primary underline">
                          {lang === "ar" ? "???? ????????" : "Take over chat"}
                        </button>
                      </div>
                    )}
                  </div>
`;

text = text.replace("</>\n            )}\n          </div>", chatInput + "\n               </>\n            )}\n          </div>");

// Also filter out [HANDOFF_RESOLVED] messages from displaying to the user if we want, or just leave them.
// Let us leave them as system messages for now, or hide them.
text = text.replace("{log.botResponse && (", "{log.botResponse && log.botResponse !== `[HANDOFF_RESOLVED]` && (");

fs.writeFileSync("artifacts/chatbot-admin/src/pages/client/ClientChatLogs.tsx", text, "utf8");

