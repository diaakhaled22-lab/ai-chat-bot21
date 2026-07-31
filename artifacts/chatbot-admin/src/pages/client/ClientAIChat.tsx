import { useState, useEffect, useRef, useCallback } from "react";
import {
  Bot, Send, Plus, Trash2, MessageSquare, Loader2, User, Sparkles, RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Conversation = { id: number; title: string; createdAt: string };
type Message = { id: number; conversationId: number; role: string; content: string; createdAt: string };

function MessageBubble({ role, content }: { role: string; content: string }) {
  const isUser = role === "user";
  return (
    <div className={cn("flex gap-3 max-w-full", isUser ? "flex-row-reverse" : "flex-row")}>
      <div className={cn(
        "w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5",
        isUser ? "bg-primary text-primary-foreground" : "bg-muted border border-border"
      )}>
        {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4 text-primary" />}
      </div>
      <div className={cn(
        "max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words",
        isUser
          ? "bg-primary text-primary-foreground rounded-tr-sm"
          : "bg-muted border border-border rounded-tl-sm"
      )}>
        {content}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-muted border border-border">
        <Bot className="w-4 h-4 text-primary" />
      </div>
      <div className="bg-muted border border-border rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:0ms]" />
        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:150ms]" />
        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:300ms]" />
      </div>
    </div>
  );
}

export default function ClientAIChat() {
  const { toast } = useToast();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState("");
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, streamContent, scrollToBottom]);

  // Load conversations on mount
  useEffect(() => {
    fetch("/api/openai/conversations")
      .then((r) => r.json())
      .then((data: Conversation[]) => {
        setConversations(data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
        if (data.length > 0) selectConversation(data[data.length - 1].id);
      })
      .catch(() => {});
  }, []);

  const loadMessages = async (convId: number) => {
    setLoadingMsgs(true);
    try {
      const res = await fetch(`/api/openai/conversations/${convId}/messages`);
      const data: Message[] = await res.json();
      setMessages(data);
    } catch {
      toast({ title: "Failed to load messages", variant: "destructive" });
    } finally {
      setLoadingMsgs(false);
    }
  };

  const selectConversation = (id: number) => {
    if (streaming) abortRef.current?.abort();
    setActiveId(id);
    setStreamContent("");
    loadMessages(id);
  };

  const newConversation = async () => {
    try {
      const res = await fetch("/api/openai/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New Chat" }),
      });
      const conv: Conversation = await res.json();
      setConversations((prev) => [conv, ...prev]);
      setActiveId(conv.id);
      setMessages([]);
      setStreamContent("");
      setTimeout(() => textareaRef.current?.focus(), 100);
    } catch {
      toast({ title: "Failed to create conversation", variant: "destructive" });
    }
  };

  const deleteConversation = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`/api/openai/conversations/${id}`, { method: "DELETE" });
      const updated = conversations.filter((c) => c.id !== id);
      setConversations(updated);
      if (activeId === id) {
        if (updated.length > 0) selectConversation(updated[0].id);
        else { setActiveId(null); setMessages([]); }
      }
    } catch {
      toast({ title: "Failed to delete conversation", variant: "destructive" });
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || streaming || !activeId) return;
    const userText = input.trim();
    setInput("");

    const tempUserMsg: Message = {
      id: Date.now(),
      conversationId: activeId,
      role: "user",
      content: userText,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);
    setStreaming(true);
    setStreamContent("");

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const res = await fetch(`/api/openai/conversations/${activeId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: userText }),
        signal: abort.signal,
      });

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        const lines = text.split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const json = JSON.parse(line.slice(6));
            if (json.content) {
              accumulated += json.content;
              setStreamContent(accumulated);
            }
            if (json.done) {
              const assistantMsg: Message = {
                id: Date.now() + 1,
                conversationId: activeId,
                role: "assistant",
                content: accumulated,
                createdAt: new Date().toISOString(),
              };
              setMessages((prev) => [...prev, assistantMsg]);
              setStreamContent("");
              // Refresh conversation title in sidebar
              const convRes = await fetch("/api/openai/conversations");
              const convs: Conversation[] = await convRes.json();
              setConversations(convs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
            }
            if (json.error) {
              toast({ title: json.error, variant: "destructive" });
            }
          } catch { /* partial chunk */ }
        }
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        toast({ title: "Failed to send message", variant: "destructive" });
        setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id));
      }
    } finally {
      setStreaming(false);
      setStreamContent("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const isEmpty = messages.length === 0 && !streaming;

  return (
    <div className="flex h-[calc(100vh-4rem)] -mt-6 -mx-6 overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 shrink-0 border-r border-border bg-muted/30 flex flex-col">
        <div className="p-3 border-b border-border">
          <Button onClick={newConversation} className="w-full gap-2" size="sm">
            <Plus className="w-4 h-4" /> New Chat
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {conversations.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-6">No conversations yet</p>
            )}
            {conversations.map((conv) => (
              <div
                key={conv.id}
                onClick={() => selectConversation(conv.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && selectConversation(conv.id)}
                className={cn(
                  "w-full text-left flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors group cursor-pointer",
                  activeId === conv.id
                    ? "bg-primary/10 text-primary font-medium"
                    : "hover:bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                <span className="flex-1 truncate">{conv.title}</span>
                <button
                  onClick={(e) => deleteConversation(conv.id, e)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:text-destructive"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="px-5 py-3 border-b border-border flex items-center gap-3 bg-background/80 backdrop-blur-sm shrink-0">
          <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="font-semibold text-sm">AI Assistant</p>
            <p className="text-xs text-muted-foreground">Powered by GPT · asks questions, answers them</p>
          </div>
          {streaming && (
            <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating…
            </div>
          )}
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 px-5 py-4">
          {!activeId && (
            <div className="h-full flex flex-col items-center justify-center text-center gap-4 py-16">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Bot className="w-8 h-8 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-lg">AI Assistant</p>
                <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                  Start a new conversation to chat with your AI assistant.
                </p>
              </div>
              <Button onClick={newConversation} className="gap-2 mt-2">
                <Plus className="w-4 h-4" /> Start chatting
              </Button>
            </div>
          )}

          {activeId && isEmpty && !loadingMsgs && (
            <div className="h-full flex flex-col items-center justify-center text-center gap-3 py-16">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <MessageSquare className="w-6 h-6 text-primary" />
              </div>
              <p className="font-medium">How can I help you today?</p>
              <p className="text-sm text-muted-foreground max-w-xs">
                Ask me anything about your chatbot, clients, or platform.
              </p>
              <div className="flex flex-wrap gap-2 mt-2 justify-center max-w-sm">
                {[
                  "How do I set up Telegram?",
                  "What are token limits?",
                  "How to improve my chatbot?",
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => { setInput(suggestion); textareaRef.current?.focus(); }}
                    className="text-xs border border-border rounded-full px-3 py-1.5 hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeId && loadingMsgs && (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {activeId && !loadingMsgs && (
            <div className="space-y-4 max-w-3xl mx-auto">
              {messages.map((msg) => (
                <MessageBubble key={msg.id} role={msg.role} content={msg.content} />
              ))}
              {streaming && streamContent && (
                <MessageBubble role="assistant" content={streamContent} />
              )}
              {streaming && !streamContent && <TypingIndicator />}
              <div ref={bottomRef} />
            </div>
          )}
        </ScrollArea>

        {/* Input */}
        {activeId && (
          <div className="px-5 py-3 border-t border-border bg-background/80 backdrop-blur-sm shrink-0">
            <div className="max-w-3xl mx-auto flex gap-2 items-end">
              <div className="flex-1 relative">
                <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Message AI Assistant… (Enter to send, Shift+Enter for newline)"
                  rows={1}
                  disabled={streaming}
                  className="resize-none min-h-[44px] max-h-[200px] pr-2 bg-muted/50 border-border focus-visible:ring-primary/30"
                  style={{ fieldSizing: "content" } as React.CSSProperties}
                />
              </div>
              {streaming ? (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => { abortRef.current?.abort(); setStreaming(false); setStreamContent(""); }}
                  className="h-[44px] w-[44px] shrink-0"
                >
                  <RotateCcw className="w-4 h-4" />
                </Button>
              ) : (
                <Button
                  onClick={sendMessage}
                  disabled={!input.trim()}
                  size="icon"
                  className="h-[44px] w-[44px] shrink-0"
                >
                  <Send className="w-4 h-4" />
                </Button>
              )}
            </div>
            <p className="text-center text-[10px] text-muted-foreground/50 mt-1.5">
              AI can make mistakes — verify important information.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
