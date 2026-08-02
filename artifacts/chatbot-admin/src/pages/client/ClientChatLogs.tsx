import { useState } from "react";
import { useListClientChatLogs, useDeleteClientChatLog, getListClientChatLogsQueryKey, useGetClientChatLogRetention, useUpdateClientChatLogRetention, getGetClientChatLogRetentionQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Search, RefreshCw, MessageCircle, MessageSquare, Globe, CalendarRange, X, Trash2, Clock } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

const RETENTION_OPTIONS = [1, 2, 3, 4, 5, 6, 7];

export default function ClientChatLogs() {
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [pendingRetention, setPendingRetention] = useState<number | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: logs, isLoading, isFetching, refetch } = useListClientChatLogs({
    channel: channelFilter !== "all" ? channelFilter : undefined,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
  });
  const deleteChatLog = useDeleteClientChatLog();
  const { data: retentionData, isLoading: retentionLoading } = useGetClientChatLogRetention();
  const updateRetention = useUpdateClientChatLogRetention();

  const currentRetention = pendingRetention ?? retentionData?.retentionDays ?? 7;

  const handleDelete = (id: number) => {
    if (!confirm("Delete this chat log entry? This cannot be undone.")) return;
    deleteChatLog.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListClientChatLogsQueryKey() });
        toast({ title: "Chat log deleted" });
      },
      onError: (error: any) => {
        toast({ title: "Failed to delete chat log", description: error.message, variant: "destructive" });
      },
    });
  };

  const handleSaveRetention = () => {
    if (pendingRetention === null) return;
    updateRetention.mutate({ data: { retentionDays: pendingRetention } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetClientChatLogRetentionQueryKey() });
        setPendingRetention(null);
        toast({ title: "Retention policy saved", description: `Chat logs will be deleted after ${pendingRetention} day${pendingRetention === 1 ? "" : "s"}.` });
      },
      onError: (error: any) => {
        toast({ title: "Failed to save retention policy", description: error.message, variant: "destructive" });
      },
    });
  };

  const hasDateFilter = Boolean(fromDate || toDate);
  const clearDateFilter = () => { setFromDate(""); setToDate(""); };

  const handleRefresh = () => {
    refetch();
  };

  const filteredLogs = logs?.filter(log => 
    log.customerMessage.toLowerCase().includes(search.toLowerCase()) ||
    log.botResponse?.toLowerCase().includes(search.toLowerCase())
  );

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case "telegram": return <MessageCircle className="w-4 h-4 text-blue-500" />;
      case "whatsapp": return <MessageSquare className="w-4 h-4 text-green-500" />;
      case "website": return <Globe className="w-4 h-4 text-purple-500" />;
      default: return <MessageCircle className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Chat Logs</h1>
          <p className="text-muted-foreground mt-2">View interactions from your AI agents.</p>
        </div>
        
        <Button onClick={handleRefresh} disabled={isFetching} variant="outline">
          <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Retention Policy */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-base">Auto-Delete Policy</CardTitle>
          </div>
          <CardDescription>
            Chat logs older than the selected number of days will be automatically deleted.
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
              {updateRetention.isPending ? "Saving…" : "Save"}
            </Button>
            {pendingRetention !== null && (
              <span className="text-xs text-muted-foreground">Unsaved changes</span>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-4">
        <div className="flex-1 flex items-center space-x-2 bg-card p-2 rounded-lg border border-border">
          <Search className="w-5 h-5 ml-2 text-muted-foreground" />
          <Input 
            placeholder="Search messages..." 
            className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-[200px]">
          <Select value={channelFilter} onValueChange={setChannelFilter}>
            <SelectTrigger className="h-full bg-card">
              <SelectValue placeholder="All Channels" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Channels</SelectItem>
              <SelectItem value="telegram">Telegram</SelectItem>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
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
          <span className="text-muted-foreground text-xs">→</span>
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
              title="Clear date filter"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="bg-card">
              <CardContent className="p-4 space-y-4">
                <div className="flex justify-between items-center">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-5 w-24" />
                </div>
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-3/4" />
              </CardContent>
            </Card>
          ))
        ) : filteredLogs?.length === 0 ? (
          <div className="text-center py-12 bg-card rounded-lg border border-border">
            <MessageSquare className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium text-foreground">No chat logs found</h3>
            <p className="text-muted-foreground">Interactions with your bot will appear here.</p>
          </div>
        ) : (
          filteredLogs?.map((log) => (
            <Card key={log.id} className="bg-card shadow-sm border-border/50">
              <CardContent className="p-0">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-muted/20">
                  <Badge variant="outline" className="flex items-center gap-1.5 bg-background">
                    {getChannelIcon(log.channel)}
                    <span className="capitalize">{log.channel}</span>
                  </Badge>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                      {new Date(log.createdAt).toLocaleString()}
                    </span>
                    <button
                      onClick={() => handleDelete(log.id)}
                      className="text-muted-foreground hover:text-destructive"
                      title="Delete this message"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="p-4 space-y-4">
                  <div className="flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                      <span className="text-xs font-medium">U</span>
                    </div>
                    <div className="bg-secondary text-secondary-foreground rounded-2xl rounded-tl-sm px-4 py-2 text-sm max-w-[80%]">
                      {log.customerMessage}
                    </div>
                  </div>
                  
                  <div className="flex gap-4 flex-row-reverse">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0 text-primary">
                      <span className="text-xs font-medium">AI</span>
                    </div>
                    <div className="bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-4 py-2 text-sm max-w-[80%]">
                      {log.botResponse}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
