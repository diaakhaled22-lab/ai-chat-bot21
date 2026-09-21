import { useState, useMemo } from "react";
import { useListClientChatLogs, useDeleteClientChatLog, getListClientChatLogsQueryKey, useGetClientChatLogRetention } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Search, RefreshCw, MessageCircle, MessageSquare, Globe, CalendarRange, X, Trash2, Clock, Download, User, Bot } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";

export default function ClientChatLogs() {
  const { t, lang } = useLanguage();
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: logs, isLoading, isFetching, refetch } = useListClientChatLogs({
    channel: channelFilter !== "all" ? channelFilter : undefined,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
  });
  const deleteChatLog = useDeleteClientChatLog();
  const { data: retentionData, isLoading: retentionLoading } = useGetClientChatLogRetention();

  const currentRetention = retentionData?.retentionDays ?? 7;

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

  return (
    <div className="space-y-6 flex flex-col flex-1 pb-10">
      <div className="flex items-center justify-between shrink-0">
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
        <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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
              <p className="text-xs text-muted-foreground mt-0.5">
                {retentionLoading ? (
                  <Skeleton className="h-3 w-48 mt-1" />
                ) : lang === "ar" ? (
                  `يتم حذف سجلات الدردشة تلقائياً بعد ${currentRetention} ${currentRetention === 1 ? "يوم" : currentRetention === 2 ? "يومين" : "أيام"} وفقاً لما حدده مسؤول النظام.`
                ) : (
                  `Chat logs are automatically deleted after ${currentRetention} day${currentRetention === 1 ? "" : "s"} as set by your administrator.`
                )}
              </p>
            </div>
          </div>
          <div className="shrink-0 self-start sm:self-auto bg-muted/50 border border-border px-3 py-1.5 rounded-lg flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-500" />
            <span className="text-sm font-bold tabular-nums">
              {retentionLoading ? (
                <Skeleton className="h-4 w-12" />
              ) : (
                `${currentRetention} ${lang === "ar" ? "أيام" : currentRetention === 1 ? "day" : "days"}`
              )}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Mini Analytics */}
      <div className="grid grid-cols-3 gap-4 shrink-0">
        <Card className="bg-card">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{lang === "ar" ? "إجمالي الرسائل" : "Total Messages"}</p>
              <p className="text-2xl font-bold">{totalMessages}</p>
            </div>
            <MessageSquare className="w-8 h-8 text-primary/20" />
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{lang === "ar" ? "المحادثات (Sessions)" : "Active Sessions"}</p>
              <p className="text-2xl font-bold">{uniqueSessions}</p>
            </div>
            <User className="w-8 h-8 text-primary/20" />
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{lang === "ar" ? "أكثر قناة نشاطاً" : "Top Channel"}</p>
              <p className="text-2xl font-bold capitalize">{topChannel}</p>
            </div>
            <Globe className="w-8 h-8 text-primary/20" />
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-4 shrink-0">
        <div className="flex-1 flex items-center space-x-2 bg-card p-2 rounded-lg border border-border">
          <Search className="w-5 h-5 ml-2 text-muted-foreground" />
          <Input 
            placeholder={t("chat_logs_search")} 
            className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-[200px]">
          <Select value={channelFilter} onValueChange={setChannelFilter}>
            <SelectTrigger className="h-full bg-card">
              <SelectValue placeholder={t("chat_logs_filter_channel")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("chat_logs_channel_all")}</SelectItem>
              <SelectItem value="telegram">{t("chat_logs_channel_telegram")}</SelectItem>
              <SelectItem value="whatsapp">{t("chat_logs_channel_whatsapp")}</SelectItem>
              <SelectItem value="website">{t("chat_logs_channel_website")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2">
          <CalendarRange className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            type="date"
            value={fromDate}
            max={toDate || undefined}
            onChange={(e) => setFromDate(e.target.value)}
            className="bg-transparent text-sm text-foreground outline-none w-[120px]"
          />
          <span className="text-muted-foreground text-xs">إلى</span>
          <input
            type="date"
            value={toDate}
            min={fromDate || undefined}
            onChange={(e) => setToDate(e.target.value)}
            className="bg-transparent text-sm text-foreground outline-none w-[120px]"
          />
          {hasDateFilter && (
            <button
              onClick={clearDateFilter}
              className="text-muted-foreground hover:text-foreground shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Inbox View Layout */}
      <Card className="flex-1 min-h-[600px] overflow-hidden flex border-border">
        
        {/* Left Pane: Sessions List */}
        <div className="w-1/3 border-r border-border flex flex-col bg-muted/10">
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
                return (
                  <button
                    key={session.id}
                    onClick={() => setSelectedSessionId(session.id)}
                    className={`w-full text-start p-4 border-b border-border transition-colors hover:bg-muted/50 flex items-start gap-3 ${isSelected ? 'bg-muted border-l-4 border-l-primary' : ''}`}
                  >
                    <div className="mt-1">
                      {getChannelIcon(session.channel)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-semibold truncate capitalize">
                          {session.channel} User
                        </span>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {new Date(session.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        {session.lastMessage}
                      </p>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* Right Pane: Active Chat View */}
        <div className="flex-1 flex flex-col bg-card relative">
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
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                       {getChannelIcon(selectedSession.channel)}
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm capitalize">{selectedSession.channel} {lang === "ar" ? "مستخدم" : "User"}</h3>
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
                      {log.botResponse && (
                        <div className="flex items-end gap-2 flex-row-reverse">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <Bot className="w-4 h-4 text-primary" />
                          </div>
                          <div className="flex flex-col gap-1 items-end max-w-[75%]">
                            <div className="bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap">
                              {log.botResponse}
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
