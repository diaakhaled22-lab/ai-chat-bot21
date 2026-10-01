import { useState, useMemo, useRef, useEffect } from "react";
import { useListClientChatLogs, getListClientChatLogsQueryKey, useMarkClientLogAsRead, useGetClientChatLogRetention } from "@workspace/api-client-react";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { Search, MessageCircle, MessageSquare, Globe, ArrowLeft, User, Bot, Send, Loader2, CheckCircle2, Zap, Trash2, UserCheck, Inbox, Sparkles, Clock } from 'lucide-react';

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";

function cleanDisplayMessage(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(/提供/g, "تقديم")
    .replace(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function extractUserName(messages: any[]): string | null {
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (!msg.customerMessage) continue;
    const text = msg.customerMessage.trim();
    if (text.startsWith("/")) continue;
    if (/^\d+$/.test(text)) continue;
    const match = text.match(/(?:my name is|i am|i'm|name:|username:|اسمي هو|اسمي|انا|أنا|الاسم:|الاسم)\s+([A-Za-z\u0600-\u06FF]{2,15})(?:\s+([A-Za-z\u0600-\u06FF]{2,15}))?/i);
    if (match) return match[1] + (match[2] ? " " + match[2] : "");
  }
  return null;
}


interface CannedResponse {
  id: number;
  companyId: number;
  title: string;
  content: string;
}

export default function ClientUniversalChat() {

  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [localReadSessions, setLocalReadSessions] = useState<Set<string>>(new Set());
  const [replyText, setReplyText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  
  const { data: logs, isLoading } = useListClientChatLogs();
  const { data: retentionData, isLoading: retentionLoading } = useGetClientChatLogRetention();
  const currentRetention = retentionData?.retentionDays ?? 3;
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

  const markLogAsRead = useMarkClientLogAsRead();

  const deleteSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const res = await fetch(`/api/client/chat-logs/session/${encodeURIComponent(sessionId)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete conversation");
      return res.json();
    },
    onSuccess: (_, deletedSessionId) => {
      if (selectedSessionId === deletedSessionId) {
        setSelectedSessionId(null);
      }
      queryClient.invalidateQueries({ queryKey: getListClientChatLogsQueryKey() });
      toast({
        title: lang === "ar" ? "تم حذف المحادثة بنجاح" : "Conversation deleted successfully",
      });
    },
    onError: () => {
      toast({
        title: lang === "ar" ? "خطأ" : "Error",
        description: lang === "ar" ? "فشل حذف المحادثة" : "Failed to delete conversation",
        variant: "destructive",
      });
    },
  });

  const handleDeleteSession = (sessionId: string) => {
    deleteSessionMutation.mutate(sessionId);
  };

  // ── MUTATION FOR REPLY / RESOLVE ───────────────────────────────────────────
  const useReplyMutation = useMutation({
    mutationFn: async ({ sessionId, message, resolveHandoff }: { sessionId: string; message: string; resolveHandoff: boolean }) => {
      const res = await fetch("/api/client/chat/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message, resolveHandoff }),
      });
      if (!res.ok) throw new Error("Failed to send message");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListClientChatLogsQueryKey() });
    },
    onError: () => {
      toast({ title: lang === "ar" ? "خطأ" : "Error", description: lang === "ar" ? "فشل إرسال الرسالة" : "Failed to send message", variant: "destructive" });
    }
  });

  const handleSendReply = () => {
    if (!replyText.trim() || !selectedSessionId) return;
    useReplyMutation.mutate({ sessionId: selectedSessionId, message: replyText.trim(), resolveHandoff: false });
    setReplyText("");
  };

  const handleResolveHandoff = () => {
    if (!selectedSessionId) return;
    useReplyMutation.mutate({ sessionId: selectedSessionId, message: "", resolveHandoff: true });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendReply();
    }
  };

  // ── SESSIONS PROCESSING ────────────────────────────────────────────────────
  const sessions = useMemo(() => {
    if (!logs) return [];
    const filteredLogs = logs.filter(log => {
      if (!search) return true;
      const searchLower = search.toLowerCase();
      const msgMatch = log.customerMessage ? log.customerMessage.toLowerCase().includes(searchLower) : false;
      const botMatch = log.botResponse ? log.botResponse.toLowerCase().includes(searchLower) : false;
      return msgMatch || botMatch;
    });

    const map = new Map<string, typeof logs>();
    filteredLogs.forEach(log => {
       const key = log.sessionId || `msg_${log.id}`;
       if (!map.has(key)) map.set(key, []);
       map.get(key)!.push(log);
    });

    return Array.from(map.values()).map(sessionLogs => {
        const sorted = [...sessionLogs].sort((a,b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        const lastMsg = sorted[sorted.length - 1];
        return {
            id: lastMsg.sessionId || `msg_${lastMsg.id}`,
            channel: lastMsg.channel,
            lastMessage: lastMsg.customerMessage || lastMsg.botResponse,
            updatedAt: lastMsg.createdAt,
            messages: sorted,
        }
    }).sort((a,b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [logs, search]);

  
  // ── KPI Calculations ───────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    if (!logs || !sessions) {
      return {
        totalSessions: 0,
        todaySessions: 0,
        activeHandoffCount: 0,
        unreadCount: 0,
        aiAutomatedRate: 100,
        channelCounts: { whatsapp: 0, telegram: 0, messenger: 0, website: 0 },
      };
    }

    const todayStr = new Date().toDateString();
    let todayCount = 0;
    let handoffCount = 0;
    const channelCounts: Record<string, number> = { whatsapp: 0, telegram: 0, messenger: 0, website: 0 };

    sessions.forEach((s) => {
      if (new Date(s.updatedAt).toDateString() === todayStr) {
        todayCount++;
      }
      if (s.channel && channelCounts[s.channel] !== undefined) {
        channelCounts[s.channel]++;
      }
      for (let i = s.messages.length - 1; i >= 0; i--) {
        if (s.messages[i].botResponse === "[HANDOFF_RESOLVED]") break;
        if (s.messages[i].isHandoff) {
          handoffCount++;
          break;
        }
      }
    });

    const unread = logs.filter((l) => !l.isRead).length;
    const total = sessions.length;
    const aiRate = total > 0 ? Math.round(((total - handoffCount) / total) * 100) : 100;

    return {
      totalSessions: total,
      todaySessions: todayCount,
      activeHandoffCount: handoffCount,
      unreadCount: unread,
      aiAutomatedRate: Math.max(0, aiRate),
      channelCounts,
    };
  }, [logs, sessions]);

  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      if (channelFilter === "all") return true;
      if (channelFilter === "handoff") {
        for (let i = s.messages.length - 1; i >= 0; i--) {
          if (s.messages[i].botResponse === "[HANDOFF_RESOLVED]") return false;
          if (s.messages[i].isHandoff) return true;
        }
        return false;
      }
      return s.channel === channelFilter;
    });
  }, [sessions, channelFilter]);

  const selectedSession = useMemo(() => {
    return sessions.find(s => s.id === selectedSessionId) || null;
  }, [sessions, selectedSessionId]);

  const isHandoff = useMemo(() => {
    if (!selectedSession) return false;
    for (let i = selectedSession.messages.length - 1; i >= 0; i--) {
      if (selectedSession.messages[i].botResponse === "[HANDOFF_RESOLVED]") return false;
      if (selectedSession.messages[i].isHandoff) return true;
    }
    return false;
  }, [selectedSession]);

  const handleSelectSession = (sessionId: string) => {
    setSelectedSessionId(sessionId);
    setLocalReadSessions(prev => new Set(prev).add(sessionId));
    
    const session = sessions.find(s => s.id === sessionId);
    if (session && session.messages.some(m => !m.isRead)) {
      queryClient.setQueryData(
        getListClientChatLogsQueryKey(),
        (oldData: any) => {
          if (!oldData) return oldData;
          return oldData.map((log: any) => 
            (log.sessionId === sessionId || `msg_${log.id}` === sessionId) 
              ? { ...log, isRead: true } 
              : log
          );
        }
      );

      const unreadLogs = session.messages.filter(m => !m.isRead);
      Promise.all(unreadLogs.map(m => markLogAsRead.mutateAsync({ id: m.id })))
        .then(() => queryClient.invalidateQueries({ queryKey: getListClientChatLogsQueryKey() }))
        .catch(() => queryClient.invalidateQueries({ queryKey: getListClientChatLogsQueryKey() }));
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedSession?.messages, isHandoff]);

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case "telegram": return <MessageCircle className="w-4 h-4 text-sky-500" />;
      case "whatsapp": return <MessageSquare className="w-4 h-4 text-emerald-500" />;
      case "website": return <Globe className="w-4 h-4 text-purple-500" />;
      default: return <MessageCircle className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-6 flex flex-col flex-1 pb-10 h-full min-h-[700px]">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{lang === "ar" ? "المحادثة الشاملة" : "Universal Chat"}</h1>
          <p className="text-muted-foreground mt-2">{lang === "ar" ? "إدارة المحادثات الحية والتدخل البشري" : "Manage live conversations and human handoff"}</p>
        </div>
      </div>

      {/* Retention Policy Banner */}
      <Card className="bg-card border-border shrink-0">
        <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold">{t("chat_logs_retention_title")}</p>
                <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-500 border-amber-500/20 font-medium">
                  {t("chat_logs_retention_admin_managed")}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {retentionLoading ? (
                  <Skeleton className="h-3 w-48 mt-1" />
                ) : lang === "ar" ? (
                  `يتم حذف سجلات الدردشة تلقائياً بعد ${currentRetention} ${currentRetention === 1 ? "يوم" : currentRetention === 2 ? "يومين" : "أيام"} وفقاً لما حدده مسؤول النظام.`
                ) : (
                  `Chat logs are automatically deleted after ${currentRetention} day${currentRetention === 1 ? "" : "s"} as set by your administrator.`
                )}
              </div>
            </div>
          </div>
          <div className="shrink-0 bg-muted/50 border border-border px-3 py-1.5 rounded-lg flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-500" />
            <div className="text-sm font-bold tabular-nums">
              {retentionLoading ? (
                <Skeleton className="h-4 w-12" />
              ) : (
                `${currentRetention} ${lang === "ar" ? "أيام" : currentRetention === 1 ? "day" : "days"}`
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* KPI Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 shrink-0">
        {/* Total Conversations */}
        <Card 
          onClick={() => setChannelFilter("all")}
          className={`p-4 border transition-all cursor-pointer hover:shadow-md ${channelFilter === "all" ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20" : "border-border bg-card/60"}`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              {lang === "ar" ? "إجمالي المحادثات" : "Total Conversations"}
            </span>
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <MessageSquare className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight tabular-nums">{kpis.totalSessions}</span>
            <span className="text-[11px] text-muted-foreground">
              {kpis.todaySessions} {lang === "ar" ? "اليوم" : "today"}
            </span>
          </div>
        </Card>

        {/* Active Handoffs */}
        <Card 
          onClick={() => setChannelFilter("handoff")}
          className={`p-4 border transition-all cursor-pointer hover:shadow-md ${channelFilter === "handoff" ? "border-amber-500/60 bg-amber-500/10 ring-1 ring-amber-500/30" : kpis.activeHandoffCount > 0 ? "border-amber-500/40 bg-amber-500/5" : "border-border bg-card/60"}`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              {lang === "ar" ? "طلبات التدخل البشري" : "Active Handoffs"}
            </span>
            <div className={`p-2 rounded-lg ${kpis.activeHandoffCount > 0 ? "bg-amber-500/20 text-amber-500 animate-pulse" : "bg-muted text-muted-foreground"}`}>
              <UserCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className={`text-2xl font-bold tracking-tight tabular-nums ${kpis.activeHandoffCount > 0 ? "text-amber-500" : ""}`}>
              {kpis.activeHandoffCount}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {kpis.activeHandoffCount > 0 
                ? (lang === "ar" ? "بانتظار الرد" : "needs action")
                : (lang === "ar" ? "لا توجد معلقة" : "all resolved")}
            </span>
          </div>
        </Card>

        {/* Unread Messages */}
        <Card className="p-4 border border-border bg-card/60 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              {lang === "ar" ? "رسائل غير مقروءة" : "Unread Messages"}
            </span>
            <div className={`p-2 rounded-lg ${kpis.unreadCount > 0 ? "bg-blue-500/20 text-blue-500" : "bg-muted text-muted-foreground"}`}>
              <Inbox className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className={`text-2xl font-bold tracking-tight tabular-nums ${kpis.unreadCount > 0 ? "text-blue-500" : ""}`}>
              {kpis.unreadCount}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {lang === "ar" ? "رسالة جديدة" : "new messages"}
            </span>
          </div>
        </Card>

        {/* AI Automation Rate */}
        <Card className="p-4 border border-border bg-card/60 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              {lang === "ar" ? "أتمتة الذكاء الاصطناعي" : "AI Resolution Rate"}
            </span>
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight tabular-nums text-emerald-500">
              {kpis.aiAutomatedRate}%
            </span>
            <span className="text-[11px] text-muted-foreground">
              {lang === "ar" ? "مكتملة آلياً" : "automated"}
            </span>
          </div>
        </Card>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <Button
            size="sm"
            variant={channelFilter === "all" ? "default" : "outline"}
            className="h-8 text-xs rounded-full px-3"
            onClick={() => setChannelFilter("all")}
          >
            {lang === "ar" ? "الكل" : "All"} ({sessions.length})
          </Button>
          <Button
            size="sm"
            variant={channelFilter === "handoff" ? "default" : "outline"}
            className={`h-8 text-xs rounded-full px-3 ${kpis.activeHandoffCount > 0 && channelFilter !== "handoff" ? "border-amber-500/50 text-amber-500 font-medium" : ""}`}
            onClick={() => setChannelFilter("handoff")}
          >
            <UserCheck className="w-3.5 h-3.5 mr-1" />
            {lang === "ar" ? "تدخل بشري" : "Handoff"} ({kpis.activeHandoffCount})
          </Button>
          <Button
            size="sm"
            variant={channelFilter === "whatsapp" ? "default" : "outline"}
            className="h-8 text-xs rounded-full px-3"
            onClick={() => setChannelFilter("whatsapp")}
          >
            <MessageSquare className="w-3.5 h-3.5 mr-1 text-emerald-500" />
            WhatsApp ({kpis.channelCounts.whatsapp || 0})
          </Button>
          <Button
            size="sm"
            variant={channelFilter === "telegram" ? "default" : "outline"}
            className="h-8 text-xs rounded-full px-3"
            onClick={() => setChannelFilter("telegram")}
          >
            <MessageCircle className="w-3.5 h-3.5 mr-1 text-sky-500" />
            Telegram ({kpis.channelCounts.telegram || 0})
          </Button>
          <Button
            size="sm"
            variant={channelFilter === "messenger" ? "default" : "outline"}
            className="h-8 text-xs rounded-full px-3"
            onClick={() => setChannelFilter("messenger")}
          >
            <MessageCircle className="w-3.5 h-3.5 mr-1 text-blue-500" />
            Messenger ({kpis.channelCounts.messenger || 0})
          </Button>
          <Button
            size="sm"
            variant={channelFilter === "website" ? "default" : "outline"}
            className="h-8 text-xs rounded-full px-3"
            onClick={() => setChannelFilter("website")}
          >
            <Globe className="w-3.5 h-3.5 mr-1 text-purple-500" />
            Website ({kpis.channelCounts.website || 0})
          </Button>
        </div>

        <div className="sm:w-72 flex items-center bg-card px-2.5 py-1 rounded-lg border border-border">
          <Search className="w-4 h-4 ml-1.5 text-muted-foreground shrink-0" />
          <Input 
            placeholder={lang === "ar" ? "ابحث في المحادثات..." : "Search conversations..."} 
            className="border-0 bg-transparent h-7 text-xs focus-visible:ring-0 focus-visible:ring-offset-0"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Inbox View Layout */}
      <Card className="flex-1 overflow-hidden flex border-border h-full">
        
        {/* Left Pane: Sessions List */}
        <div className={`w-full md:w-1/3 border-r border-border flex-col bg-muted/10 ${selectedSessionId ? 'hidden md:flex' : 'flex'}`}>
          <div className="p-3 border-b border-border bg-card font-medium text-sm text-muted-foreground shrink-0">
            {lang === "ar" ? "المحادثات الأخيرة" : "Recent Conversations"}
          </div>
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
               Array.from({ length: 5 }).map((_, i) => (
                 <div key={i} className="p-4 border-b border-border"><Skeleton className="w-full h-10" /></div>
               ))
            ) : filteredSessions.length === 0 ? (
               <div className="p-8 text-center text-muted-foreground text-sm">
                 {lang === "ar" ? "لا توجد محادثات" : "No conversations found"}
               </div>
            ) : (
              filteredSessions.map((session) => {
                const isSelected = selectedSession?.id === session.id;
                const userName = extractUserName(session.messages);
                return (
                  <div
                    key={session.id}
                    onClick={() => handleSelectSession(session.id)}
                    role="button"
                    className={`w-full text-start p-4 border-b border-border transition-colors hover:bg-muted/50 flex items-start gap-3 relative cursor-pointer ${isSelected ? 'bg-muted border-l-4 border-l-primary' : ''}`}
                  >
                    <div className="mt-1 relative">
                      {getChannelIcon(session.channel)}
                      {!localReadSessions.has(session.id) && session.messages.some(m => !m.isRead) && (
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-green-500 border-2 border-card rounded-full" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 pr-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-semibold truncate capitalize">
                          {userName ? userName : `${session.channel} ${lang === "ar" ? "مستخدم" : "User"}`}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(session.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <ConfirmDeleteDialog
                            title={lang === "ar" ? "حذف المحادثة" : "Delete Conversation"}
                            description={lang === "ar" ? "هل أنت متأكد من حذف هذه المحادثة بالكامل؟" : "Are you sure you want to delete this conversation?"}
                            onConfirm={() => handleDeleteSession(session.id)}
                          >
                            <button
                              type="button"
                              className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                              title={lang === "ar" ? "حذف المحادثة" : "Delete conversation"}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </ConfirmDeleteDialog>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        {session.lastMessage}
                      </p>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Right Pane: Active Chat View */}
        <div className={`flex-1 flex-col bg-card relative ${!selectedSessionId ? 'hidden md:flex' : 'flex'}`}>
          {!selectedSession ? (
             <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground h-full">
               <MessageSquare className="w-12 h-12 mb-4 opacity-20" />
               <p>{lang === "ar" ? "اختر محادثة لعرض التفاصيل" : "Select a conversation to view"}</p>
             </div>
          ) : (
              <div className="flex flex-col h-full flex-1 min-h-0">
                {/* Chat Header */}
                <div className="p-4 border-b border-border flex items-center justify-between bg-muted/5 shadow-sm z-10 shrink-0">
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => setSelectedSessionId(null)}
                      className="md:hidden p-2 -ml-2 text-muted-foreground hover:text-foreground"
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                       {getChannelIcon(selectedSession.channel)}
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm capitalize">
                        {extractUserName(selectedSession.messages) || `${selectedSession.channel} ${lang === "ar" ? "مستخدم" : "User"}`}
                      </h3>
                      <p className="text-xs text-muted-foreground">{selectedSession.messages.length} {lang === "ar" ? "رسالة" : "messages"}</p>
                    </div>
                  </div>
                  {isHandoff && (
                    <Badge variant="destructive" className="animate-pulse">
                      {lang === "ar" ? "تدخل بشري نشط" : "Human Handoff Active"}
                    </Badge>
                  )}
                </div>

                {/* Chat Messages */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {selectedSession.messages.map(log => (
                    <div key={log.id} className="space-y-4">
                      {log.customerMessage && (
                        <div className="flex items-end gap-2">
                          <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                            <User className="w-4 h-4 text-secondary-foreground/70" />
                          </div>
                          <div className="flex flex-col gap-1 max-w-[75%]">
                            <div className="bg-secondary text-secondary-foreground rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap">
                              {log.customerMessage}
                            </div>
                            <span className="text-[10px] text-muted-foreground ml-2">
                              {new Date(log.createdAt).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      )}
                      
                      {log.botResponse && log.botResponse !== `[HANDOFF_RESOLVED]` && (
                        <div className="flex items-end gap-2 flex-row-reverse">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <Bot className="w-4 h-4 text-primary" />
                          </div>
                          <div className="flex flex-col gap-1 items-end max-w-[75%]">
                            <div className={`text-primary-foreground rounded-2xl rounded-br-sm px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${log.isHandoff ? 'bg-orange-500' : 'bg-primary'}`}>
                              {cleanDisplayMessage(log.botResponse)}
                            </div>
                            <span className="text-[10px] text-muted-foreground mr-2">
                              {new Date(log.createdAt).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>

                {/* Reply Box */}
                <div className="p-4 border-t border-border bg-card flex flex-col gap-3 shrink-0">
                  {isHandoff && (
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs text-muted-foreground">
                        {lang === "ar" ? "أنت تتحدث حالياً مع المستخدم مباشرة." : "You are currently speaking directly with the user."}
                      </span>
                      <Button size="sm" variant="outline" onClick={handleResolveHandoff} disabled={useReplyMutation.isPending}>
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                        {lang === "ar" ? "إنهاء التدخل" : "Resolve Handoff"}
                      </Button>
                    </div>
                  )}
                  
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

                    <Textarea 
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={lang === "ar" ? "اكتب رسالتك هنا..." : "Type your message..."}
                      className="resize-none min-h-[42px] max-h-32 bg-muted/50"
                      rows={1}
                      disabled={useReplyMutation.isPending}
                    />
                    <Button 
                      onClick={handleSendReply} 
                      disabled={!replyText.trim() || useReplyMutation.isPending}
                      className="h-[42px] px-4"
                    >
                      {useReplyMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              </div>
          )}
        </div>

      </Card>
    </div>
  );
}
