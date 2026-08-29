import { useState, useEffect } from "react";
import { Megaphone, Users, CheckCircle2, Building2, Send, RotateCcw, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

type Target = "all" | "active" | "inactive";

type PreviewCompany = { id: number; name: string; isActive: boolean };
type PreviewData = { count: number; companies: PreviewCompany[] };
type SendResult = { sent: number; message?: string };

const TARGET_LABELS: Record<Target, string> = {
  all: "All clients",
  active: "Active clients only",
  inactive: "Inactive clients only",
};

const TARGET_DESCRIPTIONS: Record<Target, string> = {
  all: "Every registered client will receive this message regardless of subscription status.",
  active: "Only clients with an active subscription will receive this message.",
  inactive: "Only clients whose subscriptions are inactive or expired will receive this message.",
};

export default function AdminBroadcast() {
  const { toast } = useToast();

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [target, setTarget] = useState<Target>("all");

  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);

  useEffect(() => {
    fetchPreview(target);
  }, [target]);

  const fetchPreview = async (t: Target) => {
    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/admin/broadcast/preview?target=${t}`);
      const data: PreviewData = await res.json();
      setPreview(data);
    } catch {
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSend = async () => {
    if (!title.trim() || !message.trim()) {
      toast({ title: "Title and message are required", variant: "destructive" });
      return;
    }
    if (!preview || preview.count === 0) {
      toast({ title: "No recipients match the selected target", variant: "destructive" });
      return;
    }

    setSending(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), message: message.trim(), target }),
      });
      const data: SendResult = await res.json();
      if (res.ok) {
        setResult(data);
        toast({
          title: `Broadcast sent to ${data.sent} client${data.sent !== 1 ? "s" : ""}`,
          description: "They will see the message in their notification bell.",
        });
        setTitle("");
        setMessage("");
      } else {
        toast({ title: (data as any).error ?? "Failed to send broadcast", variant: "destructive" });
      }
    } catch {
      toast({ title: "Connection error. Please try again.", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const reset = () => {
    setTitle("");
    setMessage("");
    setTarget("all");
    setResult(null);
  };

  return (
    <div className="max-w-3xl space-y-8 pb-12">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Broadcast</h1>
        <p className="text-muted-foreground mt-2">
          Send a system message to your clients. It will appear in their notification bell instantly.
        </p>
      </div>

      {result && (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-4">
          <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-semibold text-emerald-700 dark:text-emerald-400">
              Broadcast delivered to {result.sent} client{result.sent !== 1 ? "s" : ""}
            </p>
            <p className="text-sm text-emerald-600/80 dark:text-emerald-400/70">
              Recipients will see the message in their notification bell.
            </p>
          </div>
          <Button variant="ghost" size="sm" className="ml-auto shrink-0" onClick={reset}>
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> New
          </Button>
        </div>
      )}

      <div className="grid gap-6">
        {/* Compose card */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-primary" />
              Compose Message
            </CardTitle>
            <CardDescription>Write a clear, concise message. Keep titles short and actionable.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="bc-title">Title</Label>
              <Input
                id="bc-title"
                placeholder="e.g. Scheduled maintenance on July 10th"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={100}
                className="bg-background"
              />
              <p className="text-xs text-muted-foreground text-right">{title.length}/100</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bc-message">Message</Label>
              <Textarea
                id="bc-message"
                placeholder="e.g. We will be performing maintenance on July 10th from 2–4 AM UTC. Your chatbot will be temporarily unavailable during this window."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                maxLength={1000}
                className="bg-background resize-none"
              />
              <p className="text-xs text-muted-foreground text-right">{message.length}/1000</p>
            </div>
          </CardContent>
        </Card>

        {/* Target & Preview card */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              Recipients
            </CardTitle>
            <CardDescription>Choose who receives this broadcast.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Target audience</Label>
              <Select value={target} onValueChange={(v) => setTarget(v as Target)}>
                <SelectTrigger className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(TARGET_LABELS) as [Target, string][]).map(([k, label]) => (
                    <SelectItem key={k} value={k}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{TARGET_DESCRIPTIONS[target]}</p>
            </div>

            {/* Live preview */}
            <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Preview — who will receive it
                </span>
                {previewLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                ) : (
                  <Badge variant="outline" className="text-xs">
                    {preview?.count ?? 0} recipient{(preview?.count ?? 0) !== 1 ? "s" : ""}
                  </Badge>
                )}
              </div>

              {!previewLoading && preview && preview.count === 0 && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                  No companies match this target. No message will be sent.
                </div>
              )}

              {!previewLoading && preview && preview.companies.length > 0 && (
                <ul className="space-y-1.5">
                  {preview.companies.map((c) => (
                    <li key={c.id} className="flex items-center gap-2 text-sm">
                      <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="flex-1 truncate">{c.name}</span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] shrink-0 ${c.isActive ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500" : "border-muted text-muted-foreground"}`}
                      >
                        {c.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </li>
                  ))}
                  {preview.count > 10 && (
                    <li className="text-xs text-muted-foreground pl-5">
                      + {preview.count - 10} more…
                    </li>
                  )}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Notification preview */}
        {(title || message) && (
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground">Notification Preview</span>
              </CardTitle>
              <CardDescription>This is how clients will see the message in their bell.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-xl border border-border bg-background p-4 flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0 mt-0.5">
                  <Megaphone className="w-4 h-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="text-sm font-semibold leading-tight">
                    {title || <span className="text-muted-foreground italic">No title yet…</span>}
                  </p>
                  <p className="text-xs text-muted-foreground leading-snug whitespace-pre-wrap">
                    {message || <span className="italic">No message yet…</span>}
                  </p>
                  <p className="text-[10px] text-muted-foreground/50 mt-1">just now</p>
                </div>
                <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0 mt-2" />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Send button */}
        <div className="flex items-center gap-3 justify-end">
          <Button variant="outline" onClick={reset} disabled={sending}>
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset
          </Button>
          <Button
            onClick={handleSend}
            disabled={sending || !title.trim() || !message.trim() || (preview?.count ?? 0) === 0}
            className="gap-2 min-w-[160px]"
          >
            {sending ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
            ) : (
              <><Send className="w-4 h-4" /> Send to {preview?.count ?? "…"} client{(preview?.count ?? 1) !== 1 ? "s" : ""}</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
