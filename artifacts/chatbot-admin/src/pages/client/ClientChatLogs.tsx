import { useState, useMemo } from "react";
import { useListClientChatLogs, useDeleteClientChatLog, getListClientChatLogsQueryKey, useGetClientChatLogRetention, useMarkClientLogAsRead } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Search, RefreshCw, MessageCircle, MessageSquare, Globe, CalendarRange, X, Trash2, Clock, Download, User, Bot, ArrowLeft, Smile, Frown, Meh, Angry } from 'lucide-react';

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    
    // 1. Direct regex match (handles Arabic & English: "My name is X", "Name: X", "اسمي X", "الاسم: X", etc.)
    const match = text.match(/(?:my name is|i am|i'm|name:|username:|اسمي هو|اسمي|انا|أنا|الاسم:|الاسم)\s+([A-Za-z\u0600-\u06FF]{2,15})(?:\s+([A-Za-z\u0600-\u06FF]{2,15}))?/i);
    if (match) {
      return match[1] + (match[2] ? " " + match[2] : "");
    }

    // 2. Contextual match (bot asked for name in previous message)
    if (i > 0) {
      const prevMsg = messages[i - 1];
      if (prevMsg.botResponse) {
        const botText = prevMsg.botResponse.toLowerCase();
        // Check if bot asked about "name" or "اسم"
        if ((botText.includes("name") || botText.includes("اسم") || botText.includes("who are you")) && text.split(/\s+/).length <= 3) {
          if (!text.includes("?") && !text.includes("لا") && !text.includes("no") && !/^\d+$/.test(text)) {
             return text;
          }
        }
      }
    }
  }
  return null;
}

export default function ClientChatLogs() {
  const { t, lang } = useLanguage();
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [localReadSessions, setLocalReadSessions] = useState<Set<string>>(new Set());

    const [replyMessage, setReplyMessage] = useState("");
  const [isReplying, setIsReplying] = useState(false);
  const queryClient = useQueryClient();

  const handleReply = async () => {
    if (!replyMessage.trim() || !selectedSession) return;
    setIsReplying(true);
    try {
      await fetch("/api/client/chat/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" }, credentials: "include",
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
        headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({
          sessionId: selectedSession.id,
          channel: selectedSession.channel,
        })
      });
      queryClient.invalidateQueries({ queryKey: getListClientChatLogsQueryKey() });
    } catch(e) {}
  };

  const { toast } = useToast();
  const { data: logs, isLoading, isFetching, refetch } = useListClientChatLogs({
    channel: channelFilter !== "all" ? channelFilter : undefined,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
  });
  const deleteChatLog = useDeleteClientChatLog();
  const markLogAsRead = useMarkClientLogAsRead();
  const { data: retentionData, isLoading: retentionLoading } = useGetClientChatLogRetention();

  const currentRetention = retentionData?.retentionDays ?? 7;

  const dateOptions = useMemo(() => {
    const options = [];
    const today = new Date();
    for (let i = 0; i < currentRetention; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().split("T")[0];
      let label = iso;
      if (i === 0) label = lang === "ar" ? `اليوم (${iso})` : `Today (${iso})`;
      else if (i === 1) label = lang === "ar" ? `أمس (${iso})` : `Yesterday (${iso})`;
      
      options.push({ value: iso, label });
    }
    return options;
  }, [currentRetention, lang]);

  // Group logs into sessions
  const sessions = useMemo(() => {
    if (!logs) return [];
    
    // First, apply text search filter globally if present
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
            lastMessage: lastMsg.customerMessage,
            updatedAt: lastMsg.createdAt,
            messages: sorted,
        }
    }).sort((a,b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [logs, search]);

  const selectedSession = useMemo(() => {
    return sessions.find(s => s.id === selectedSessionId) || sessions[0] || null;
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
      
      // Optimistic UI update for instant feedback
      queryClient.setQueryData(
        getListClientChatLogsQueryKey({
          channel: channelFilter !== "all" ? channelFilter : undefined,
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
        }),
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
        .then(() => {
          queryClient.invalidateQueries({ queryKey: getListClientChatLogsQueryKey() });
        })
        .catch(() => {
          queryClient.invalidateQueries({ queryKey: getListClientChatLogsQueryKey() });
        });
    }
  };

  const handleDelete = (id: number) => {
    if (!confirm(lang === "ar" ? "هل أنت متأكد من حذف هذه الرسالة؟" : "Delete this message?")) return;
    deleteChatLog.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListClientChatLogsQueryKey() });
        toast({ title: lang === "ar" ? "تم حذف الرسالة بنجاح" : "Message deleted" });
      },
    });
  };

  const handleExportCSV = () => {
    if (!logs || logs.length === 0) return;
    
    const headers = ["ID", "Channel", "Session ID", "Customer Message", "Bot Response", "Date"];
    const csvContent = [
      headers.join(","),
      ...logs.map(log => [
        log.id,
        log.channel,
        log.sessionId || "",
        `"${(log.customerMessage || "").replace(/"/g, '""')}"`,
        `"${(log.botResponse || "").replace(/"/g, '""')}"`,
        new Date(log.createdAt).toISOString()
      ].join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `chat-logs-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const hasDateFilter = Boolean(fromDate || toDate);
  const clearDateFilter = () => { setFromDate(""); setToDate(""); };

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case "telegram": return <MessageCircle className="w-4 h-4 text-sky-500" />;
      case "whatsapp": return <MessageSquare className="w-4 h-4 text-emerald-500" />;
      case "website": return <Globe className="w-4 h-4 text-purple-500" />;
      default: return <MessageCircle className="w-4 h-4" />;
    }
  };

  // Stats
  const totalMessages = logs?.length || 0;
  const uniqueSessions = sessions.length;
  const channelCounts = logs?.reduce((acc, log) => {
    acc[log.channel] = (acc[log.channel] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};
  const topChannel = Object.entries(channelCounts).sort((a,b) => b[1] - a[1])[0]?.[0] || "None";
  
  const unreadSessionsCount = sessions.filter(s => s.messages.some(m => !m.isRead) && !localReadSessions.has(s.id)).length;
  const readSessionsCount = uniqueSessions - unreadSessionsCount;

  return (
    <div className="space-y-6 flex flex-col flex-1 pb-10">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("chat_logs_title")}</h1>
          <p className="text-muted-foreground mt-2">{t("chat_logs_desc")}</p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button onClick={handleExportCSV} disabled={!logs?.length} variant="outline" className="bg-card">
            <Download className="w-4 h-4 mr-2" />
            {lang === "ar" ? "تصدير CSV" : "Export CSV"}
          </Button>
          <Button onClick={() => refetch()} disabled={isFetching} variant="outline">
            <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
            {t("btn_refresh")}
          </Button>
        </div>
      </div>

      {/* Retention Policy Banner (Read-only for client, managed by admin) */}
      <Card className="bg-card border-border shrink-0">
        <CardContent className="p-4 pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3">
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
          <div className="shrink-0 self-start sm:self-auto bg-muted/50 border border-border px-3 py-1.5 rounded-lg flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-500" />
            <div className="text-sm font-bold tabular-nums">
              {retentionLoading ? (
                <Skeleton className="h-4 w-12" />
              ) : (
                `${currentRetention} ${lang === "ar" ? "أيام" : currentRetention === 1 ? "day" : "days"}`
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Mini Analytics */}
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 shrink-0">
        <Card className="bg-card border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium truncate pr-2">{lang === "ar" ? "إجمالي الرسائل" : "Total Messages"}</CardTitle>
            <MessageSquare className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalMessages}</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium truncate pr-2">{lang === "ar" ? "الجلسات النشطة (Sessions)" : "Active Sessions"}</CardTitle>
            <User className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{uniqueSessions}</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium truncate pr-2">{lang === "ar" ? "غير مقروءة" : "Unread"}</CardTitle>
            <MessageCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-500">{unreadSessionsCount}</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium truncate pr-2">{lang === "ar" ? "مقروءة" : "Read"}</CardTitle>
            <MessageSquare className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-500">{readSessionsCount}</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium truncate pr-2">{lang === "ar" ? "القناة الأكثر نشاطاً" : "Top Channel"}</CardTitle>
            <Globe className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold capitalize">{topChannel}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 shrink-0">
        <div className="flex-1 flex items-center space-x-2 bg-card p-2 rounded-lg border border-border">
          <Search className="w-5 h-5 ml-2 text-muted-foreground" />
          <Input 
            placeholder={t("chat_logs_search")} 
            className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-full md:w-[200px]">
          <Select value={channelFilter} onValueChange={setChannelFilter}>
            <SelectTrigger className="h-full bg-card">
              <SelectValue placeholder={t("chat_logs_filter_channel")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("chat_logs_channel_all")}</SelectItem>
              <SelectItem value="telegram">{t("chat_logs_channel_telegram")}</SelectItem>
              <SelectItem value="whatsapp">{t("chat_logs_channel_whatsapp")}</SelectItem>
              <SelectItem value="messenger">{t("chat_logs_channel_messenger")}</SelectItem>
              <SelectItem value="website">{t("chat_logs_channel_website")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-full md:w-[220px]">
          <Select 
            value={hasDateFilter ? fromDate : "all"} 
            onValueChange={(val) => {
              if (val === "all") {
                clearDateFilter();
              } else {
                setFromDate(val);
                setToDate(val);
              }
            }}
          >
            <SelectTrigger className="h-full bg-card">
              <div className="flex items-center gap-2 truncate">
                <CalendarRange className="w-4 h-4 text-muted-foreground shrink-0" />
                <SelectValue placeholder={lang === "ar" ? "كل الأيام" : "All Days"} />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{lang === "ar" ? "كل الأيام" : "All Days"}</SelectItem>
              {dateOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Inbox View Layout */}
      <Card className="flex-1 min-h-[600px] overflow-hidden flex border-border">
        
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
            ) : sessions.length === 0 ? (
               <div className="p-8 text-center text-muted-foreground text-sm">
                 {lang === "ar" ? "لا توجد محادثات" : "No conversations found"}
               </div>
            ) : (
              sessions.map((session) => {
                const isSelected = selectedSession?.id === session.id;
                const userName = extractUserName(session.messages);
                return (
                  <div
                    key={session.id}
                    onClick={() => handleSelectSession(session.id)}
                    role="button"
                    className={`w-full text-start p-4 border-b border-border transition-colors hover:bg-muted/50 flex items-start gap-3 relative group cursor-pointer ${isSelected ? 'bg-muted border-l-4 border-l-primary' : ''}`}
                  >
                    <div className="mt-1 relative">
                      {getChannelIcon(session.channel)}
                      {!localReadSessions.has(session.id) && session.messages.some(m => !m.isRead) && (
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-green-500 dark:bg-green-400 border-2 border-card rounded-full" title={lang === "ar" ? "رسالة جديدة" : "New message"} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 pr-6">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-semibold truncate capitalize">
                          {userName ? userName : `${session.channel} ${lang === "ar" ? "مستخدم" : "User"}`}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {new Date(session.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (!confirm(lang === "ar" ? "هل أنت متأكد من حذف هذه المحادثة بالكامل؟" : "Delete this entire conversation?")) return;
                              try {
                                await Promise.all(session.messages.map(log => deleteChatLog.mutateAsync({ id: log.id })));
                                queryClient.invalidateQueries({ queryKey: getListClientChatLogsQueryKey() });
                                toast({ title: lang === "ar" ? "تم حذف المحادثة بنجاح" : "Conversation deleted" });
                                if (selectedSessionId === session.id) {
                                  setSelectedSessionId(null);
                                }
                              } catch (err) {
                                toast({ title: "Failed to delete some messages", variant: "destructive" });
                              }
                            }}
                            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                            title={lang === "ar" ? "حذف المحادثة" : "Delete conversation"}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
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
             <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
               <MessageSquare className="w-12 h-12 mb-4 opacity-20" />
               <p>{lang === "ar" ? "اختر محادثة لعرض التفاصيل" : "Select a conversation to view"}</p>
             </div>
          ) : (
              <>
                {/* Chat Header */}
                <div className="p-4 border-b border-border flex items-center justify-between bg-muted/5 shadow-sm z-10 shrink-0">
                  <div className="flex items-center gap-3">
                    
                    <button 
                      onClick={() => setSelectedSessionId(null)}
                      className="md:hidden p-2 -ml-2 text-muted-foreground hover:text-foreground"
                      title="Back to list"
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                       {getChannelIcon(selectedSession.channel)}
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm capitalize">
                        {(() => {
                           const uName = extractUserName(selectedSession.messages);
                           return uName ? uName : `${selectedSession.channel} ${lang === "ar" ? "مستخدم" : "User"}`;
                        })()}
                      </h3>
                      <p className="text-xs text-muted-foreground">{selectedSession.messages.length} {lang === "ar" ? "رسالة" : "messages"}</p>
                    </div>
                  </div>
                </div>

                {/* Chat Messages */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {selectedSession.messages.map(log => (
                    <div key={log.id} className="space-y-4">
                      {/* Customer Bubble */}
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
                      
                      {/* Bot Bubble */}
                      {log.botResponse && log.botResponse !== `[HANDOFF_RESOLVED]` && (
                        <div className="flex items-end gap-2 flex-row-reverse">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <Bot className="w-4 h-4 text-primary" />
                          </div>
                          <div className="flex flex-col gap-1 items-end max-w-[75%]">
                            <div className="bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap">
                              {cleanDisplayMessage(log.botResponse)}
                            </div>
                            <div className="flex items-center gap-2 mr-2">
                              <span className="text-[10px] text-muted-foreground">
                                {new Date(log.createdAt).toLocaleString()}
                              </span>
                              <button 
                                onClick={() => handleDelete(log.id)}
                                className="text-muted-foreground hover:text-destructive transition-colors"
                                title="Delete message pair"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
             </>
          )}
        </div>

      </Card>
    </div>
  );
}





