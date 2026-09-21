import { useState, useMemo } from "react";
import {
  useListAllChatLogs,
  useDeleteChatLog,
  getListAllChatLogsQueryKey,
  useGetAdminChatLogRetention,
  useUpdateAdminChatLogRetention,
  getGetAdminChatLogRetentionQueryKey,
  useListCompanies,
  useMarkAdminChatLogAsRead,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Search,
  RefreshCw,
  MessageCircle,
  MessageSquare,
  Globe,
  CalendarRange,
  X,
  Trash2,
  Clock,
  User,
  Bot,
  Building2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

const RETENTION_OPTIONS = [1, 3, 7, 14, 30, 90, 365];

function cleanDisplayMessage(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(/提供/g, "تقديم")
    .replace(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export default function AdminChatLogs() {
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState("all");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null,
  );
  const [localReadSessions, setLocalReadSessions] = useState<Set<string>>(
    new Set(),
  );

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: companies } = useListCompanies();

  const {
    data: logs,
    isLoading,
    isFetching,
    refetch,
  } = useListAllChatLogs({
    channel: channelFilter !== "all" ? (channelFilter as any) : undefined,
    companyId: companyFilter !== "all" ? Number(companyFilter) : undefined,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
  });

  const { data: retentionData, isLoading: retentionLoading } =
    useGetAdminChatLogRetention();
  const updateRetention = useUpdateAdminChatLogRetention({
    mutation: {
      onSuccess: () => {
        toast({ title: "Retention policy updated" });
        setPendingRetention(null);
        queryClient.invalidateQueries({
          queryKey: getGetAdminChatLogRetentionQueryKey(),
        });
      },
    },
  });

  const currentRetention = retentionData?.days ?? 30;
  const [pendingRetention, setPendingRetention] = useState<number | null>(null);

  const deleteChatLog = useDeleteChatLog();
  const markLogAsRead = useMarkAdminChatLogAsRead();

  const handleSelectSession = (sessionId: string) => {
    setSelectedSessionId(sessionId);
    setLocalReadSessions((prev) => new Set(prev).add(sessionId));

    const session = sessions.find((s) => s.id === sessionId);
    if (session && session.messages.some((m) => !m.isRead)) {
      // Optimistic UI update for instant feedback
      queryClient.setQueryData(
        getListAllChatLogsQueryKey({
          channel: channelFilter !== "all" ? (channelFilter as any) : undefined,
          companyId: companyFilter !== "all" ? Number(companyFilter) : undefined,
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
        }),
        (oldData: any) => {
          if (!oldData) return oldData;
          return oldData.map((log: any) =>
            log.sessionId === sessionId || `msg_${log.id}` === sessionId
              ? { ...log, isRead: true }
              : log,
          );
        },
      );

      const unreadLogs = session.messages.filter((m) => !m.isRead);
      Promise.all(unreadLogs.map((m) => markLogAsRead.mutateAsync({ id: m.id })))
        .then(() => {
          queryClient.invalidateQueries({ queryKey: getListAllChatLogsQueryKey() });
        })
        .catch((err) => {
          console.error("Failed to mark as read", err);
          toast({
            title: "Failed to mark message as read",
            description: "Make sure you restarted the API server.",
            variant: "destructive",
          });
          queryClient.invalidateQueries({ queryKey: getListAllChatLogsQueryKey() });
        });
    }
  };

  const hasDateFilter = Boolean(fromDate || toDate);
  const clearDateFilter = () => {
    setFromDate("");
    setToDate("");
  };

  const handleRefresh = () => {
    refetch();
  };

  const handleSaveRetention = () => {
    if (pendingRetention !== null) {
      updateRetention.mutate({ data: { days: pendingRetention } });
    }
  };

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case "telegram":
        return <MessageCircle className="w-4 h-4 text-blue-500" />;
      case "whatsapp":
        return <MessageSquare className="w-4 h-4 text-green-500" />;
      case "messenger":
        return <MessageCircle className="w-4 h-4 text-indigo-500" />;
      case "website":
        return <Globe className="w-4 h-4 text-purple-500" />;
      default:
        return <MessageCircle className="w-4 h-4" />;
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this message?")) return;
    try {
      await deleteChatLog.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getListAllChatLogsQueryKey() });
      toast({ title: "Message deleted successfully" });
    } catch (err) {
      toast({ title: "Failed to delete message", variant: "destructive" });
    }
  };

  // Filter logs by search term
  const filteredLogs = useMemo(() => {
    if (!logs) return [];
    if (!search) return logs;
    const s = search.toLowerCase();
    return logs.filter(
      (log) =>
        log.customerMessage?.toLowerCase().includes(s) ||
        log.botResponse?.toLowerCase().includes(s) ||
        log.companyName?.toLowerCase().includes(s),
    );
  }, [logs, search]);

  // Group into sessions
  const sessions = useMemo(() => {
    const map = new Map<string, typeof filteredLogs>();
    filteredLogs.forEach((log) => {
      const key = log.sessionId || `msg_${log.id}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(log);
    });

    return Array.from(map.entries())
      .map(([sessionId, sessionLogs]) => {
        sessionLogs.sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
        const lastLog = sessionLogs[sessionLogs.length - 1];
        return {
          id: sessionId,
          companyName: lastLog.companyName,
          channel: lastLog.channel,
          updatedAt: lastLog.createdAt,
          lastMessage: lastLog.customerMessage,
          messages: sessionLogs,
        };
      })
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
  }, [filteredLogs]);

  const selectedSession = sessions.find((s) => s.id === selectedSessionId);

  // Analytics
  const totalMessages = filteredLogs.length;
  const activeSessions = sessions.length;

  const unreadSessionsCount = sessions.filter((s) =>
    s.messages.some((m) => !m.isRead) && !localReadSessions.has(s.id)
  ).length;
  const readSessionsCount = activeSessions - unreadSessionsCount;

  const channelCounts = filteredLogs.reduce(
    (acc, log) => {
      acc[log.channel] = (acc[log.channel] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  const topChannel =
    Object.entries(channelCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "None";

  const companyCounts = filteredLogs.reduce(
    (acc, log) => {
      const cName = log.companyName || "Unknown";
      acc[cName] = (acc[cName] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  const topCompany =
    Object.entries(companyCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "None";

  return (
    <div className="space-y-6 flex flex-col flex-1 pb-10">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Global Chat Logs
          </h1>
          <p className="text-muted-foreground mt-2">
            View interactions across all deployed chatbots.
          </p>
        </div>
        <Button
          onClick={handleRefresh}
          disabled={isFetching || isLoading}
          variant="outline"
          size="sm"
        >
          <RefreshCw
            className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      {/* Retention Policy */}
      <Card className="bg-card border-border shrink-0">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-base">Auto-Delete Policy</CardTitle>
          </div>
          <CardDescription>
            Chat logs older than the selected number of days will be
            automatically deleted across all companies.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            {retentionLoading ? (
              <Skeleton className="h-9 w-[160px]" />
            ) : (
              <Select
                value={String(currentRetention)}
                onValueChange={(val) => setPendingRetention(Number(val))}
              >
                <SelectTrigger className="w-[160px] bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RETENTION_OPTIONS.map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {d} {d === 1 ? "day" : "days"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button
              onClick={handleSaveRetention}
              disabled={pendingRetention === null || updateRetention.isPending}
              size="sm"
            >
              {updateRetention.isPending ? "Saving..." : "Save"}
            </Button>
            {pendingRetention !== null && (
              <span className="text-xs text-muted-foreground">
                Unsaved changes
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Mini Analytics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 shrink-0">
        <Card className="bg-card">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground font-bold">Total Messages</p>
              <p className="text-2xl font-bold">{totalMessages}</p>
            </div>
            <MessageSquare className="w-8 h-8 text-primary/20" />
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground font-bold">Active Sessions</p>
              <p className="text-2xl font-bold">{activeSessions}</p>
            </div>
            <User className="w-8 h-8 text-primary/20" />
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground dark:text-green-400/90 font-bold">Unread</p>
              <p className="text-2xl font-bold text-foreground dark:text-green-500">
                {unreadSessionsCount}
              </p>
            </div>
            <MessageCircle className="w-8 h-8 text-green-500/20 dark:text-green-400" />
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground dark:text-orange-400/90 font-bold">Read</p>
              <p className="text-2xl font-bold text-foreground dark:text-orange-500">
                {readSessionsCount}
              </p>
            </div>
            <MessageSquare className="w-8 h-8 text-orange-500/20 dark:text-orange-400" />
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground font-bold">Top Channel</p>
              <p className="text-2xl font-bold capitalize">{topChannel}</p>
            </div>
            <Globe className="w-8 h-8 text-primary/20" />
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground font-bold">Top Company</p>
              <p className="text-lg font-bold truncate max-w-[120px]">
                {topCompany}
              </p>
            </div>
            <Building2 className="w-8 h-8 text-primary/20" />
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-4 shrink-0 flex-wrap">
        <div className="flex-1 min-w-[200px] flex items-center space-x-2 bg-card p-2 rounded-lg border border-border">
          <Search className="w-5 h-5 ml-2 text-muted-foreground" />
          <Input
            placeholder="Search messages or company..."
            className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="w-[180px]">
          <Select value={companyFilter} onValueChange={setCompanyFilter}>
            <SelectTrigger className="h-full bg-card">
              <SelectValue placeholder="All Companies" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Companies</SelectItem>
              {companies?.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-[180px]">
          <Select value={channelFilter} onValueChange={setChannelFilter}>
            <SelectTrigger className="h-full bg-card">
              <SelectValue placeholder="All Channels" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Channels</SelectItem>
              <SelectItem value="telegram">Telegram</SelectItem>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
              <SelectItem value="messenger">Messenger</SelectItem>
              <SelectItem value="website">Website</SelectItem>
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
          <span className="text-muted-foreground text-xs">to</span>
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
              title="Clear dates"
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
            Recent Conversations
          </div>
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="p-4 border-b border-border">
                  <Skeleton className="w-full h-10" />
                </div>
              ))
            ) : sessions.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                No conversations found
              </div>
            ) : (
              sessions.map((session) => {
                const isSelected = selectedSession?.id === session.id;
                return (
                  <div
                    key={session.id}
                    onClick={() => handleSelectSession(session.id)}
                    role="button"
                    className={`w-full text-start p-4 border-b border-border transition-colors hover:bg-muted/50 flex items-start gap-3 relative group cursor-pointer ${isSelected ? "bg-muted border-l-4 border-l-primary" : ""}`}
                  >
                    <div className="mt-1 relative">
                      {getChannelIcon(session.channel)}
                      {!localReadSessions.has(session.id) &&
                        session.messages.some((m) => !m.isRead) && (
                          <span
                            className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-green-500 dark:bg-green-400 border-2 border-card rounded-full"
                            title="New message"
                          />
                        )}
                    </div>
                    <div className="flex-1 min-w-0 pr-6">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-semibold truncate capitalize">
                          {session.companyName}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {new Date(session.updatedAt).toLocaleTimeString(
                              [],
                              { hour: "2-digit", minute: "2-digit" },
                            )}
                          </span>
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (!confirm("Delete this entire conversation?"))
                                return;
                              try {
                                await Promise.all(
                                  session.messages.map((log) =>
                                    deleteChatLog.mutateAsync({ id: log.id }),
                                  ),
                                );
                                queryClient.invalidateQueries({
                                  queryKey: getListAllChatLogsQueryKey(),
                                });
                                toast({ title: "Conversation deleted" });
                                if (selectedSessionId === session.id) {
                                  setSelectedSessionId(null);
                                }
                              } catch (err) {
                                toast({
                                  title: "Failed to delete some messages",
                                  variant: "destructive",
                                });
                              }
                            }}
                            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                            title="Delete conversation"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 mb-1">
                        <span className="text-xs px-1.5 py-0.5 bg-secondary rounded text-secondary-foreground capitalize">
                          {session.channel}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        {session.lastMessage}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Pane: Active Chat View */}
        <div className="flex-1 flex flex-col bg-card relative">
          {!selectedSession ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
              <MessageSquare className="w-12 h-12 mb-4 opacity-20" />
              <p>Select a conversation to view</p>
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
                    <h3 className="font-semibold text-sm capitalize">
                      {selectedSession.companyName} - {selectedSession.channel}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {selectedSession.messages.length} messages
                    </p>
                  </div>
                </div>
              </div>

              {/* Chat Messages */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {selectedSession.messages.map((log) => (
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
