import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import {
  AlertCircle, CheckCircle2, Clock, Bot, ChevronDown, ChevronUp,
  Sparkles, Loader2, User, Calendar, Search, X, PenLine, RotateCcw,
} from "lucide-react";
import SupportAICard from "@/components/SupportAICard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

interface Ticket {
  id: number;
  clientId: number;
  clientName: string;
  clientUsername: string;
  title: string;
  description: string;
  status: "open" | "resolved";
  aiResponse: string | null;
  aiProvider: string | null;
  aiModel: string | null;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
}

const PROVIDER_LABELS: Record<string, { label: string; color: string }> = {
  openai:     { label: "OpenAI",     color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
  anthropic:  { label: "Anthropic",  color: "text-orange-400 bg-orange-500/10 border-orange-500/30"   },
  google:     { label: "Google",     color: "text-blue-400 bg-blue-500/10 border-blue-500/30"         },
  openrouter: { label: "OpenRouter", color: "text-purple-400 bg-purple-500/10 border-purple-500/30"   },
};

type Filter = "all" | "open" | "resolved";

// ─── TicketCard ───────────────────────────────────────────────────────────────
function TicketCard({
  ticket,
  onResolve,
  onAiSolve,
  onAdminNote,
  resolving,
  aiSolving,
  adminSolving,
}: {
  ticket: Ticket;
  onResolve:    (id: number, status: "open" | "resolved") => void;
  onAiSolve:    (id: number) => void;
  onAdminNote:  (id: number, note: string) => void;
  resolving:    boolean;
  aiSolving:    boolean;
  adminSolving: boolean;
}) {
  const [expanded,    setExpanded]    = useState(false);
  const [manualMode,  setManualMode]  = useState(false);
  const [manualNote,  setManualNote]  = useState("");

  const isOpen = ticket.status === "open";

  function handleAiSolve(e: React.MouseEvent) {
    e.stopPropagation();
    setManualMode(false);
    onAiSolve(ticket.id);
    setExpanded(true);
  }

  function handleManualClick(e: React.MouseEvent) {
    e.stopPropagation();
    setManualMode(true);
    setExpanded(true);
  }

  function handleSubmitNote() {
    if (!manualNote.trim()) return;
    onAdminNote(ticket.id, manualNote);
    setManualMode(false);
    setManualNote("");
  }

  const prov = PROVIDER_LABELS[ticket.aiProvider ?? ""] ?? {
    label: ticket.aiProvider ?? "AI",
    color: "text-violet-400 bg-violet-500/10 border-violet-500/30",
  };

  return (
    <div className={`bg-card border rounded-xl overflow-hidden transition-all ${
      isOpen ? "border-amber-500/30" : "border-emerald-500/20"
    }`}>

      {/* ── Header row ── */}
      <div className="flex items-start gap-3 p-4">
        {/* Status icon */}
        <div className={`mt-1 shrink-0 ${isOpen ? "text-amber-400" : "text-emerald-400"}`}>
          {isOpen ? <AlertCircle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
        </div>

        {/* Title + meta — clickable to expand */}
        <div
          className="flex-1 min-w-0 cursor-pointer"
          onClick={() => setExpanded((v) => !v)}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-sm truncate">{ticket.title}</h3>
            <Badge
              variant={isOpen ? "destructive" : "secondary"}
              className="text-[10px] shrink-0"
            >
              {isOpen ? "Open" : "Resolved"}
            </Badge>
            {ticket.aiResponse && (
              <span className="inline-flex items-center gap-1 text-[10px] text-violet-400">
                <Bot className="w-3 h-3" /> AI
              </span>
            )}
            {ticket.adminNote && !ticket.aiResponse && (
              <span className="inline-flex items-center gap-1 text-[10px] text-blue-400">
                <PenLine className="w-3 h-3" /> Manual
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1">
              <User className="w-3 h-3" />{ticket.clientName}
            </span>
            <span className="opacity-50">·</span>
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />{new Date(ticket.createdAt).toLocaleDateString()}
            </span>
            {ticket.aiModel && (
              <>
                <span className="opacity-50">·</span>
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium ${prov.color}`}>
                  {prov.label} · {ticket.aiModel}
                </span>
              </>
            )}
          </div>
        </div>

        {/* ── Action buttons (always visible for open tickets) ── */}
        <div className="shrink-0 flex items-center gap-2">
          {isOpen && (
            <>
              {/* AI Solve */}
              <Button
                size="sm"
                variant="outline"
                onClick={handleAiSolve}
                disabled={aiSolving || adminSolving}
                title="Let the AI agent solve this problem"
                className="border-violet-500/40 text-violet-400 hover:bg-violet-500/10 gap-1.5 text-xs h-8 px-3"
              >
                {aiSolving
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Sparkles className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">AI Agent</span>
              </Button>

              {/* Manual Solve */}
              <Button
                size="sm"
                variant="outline"
                onClick={handleManualClick}
                disabled={aiSolving || adminSolving}
                title="I will solve this myself"
                className="border-blue-500/40 text-blue-400 hover:bg-blue-500/10 gap-1.5 text-xs h-8 px-3"
              >
                {adminSolving
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <PenLine className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">Solve Myself</span>
              </Button>
            </>
          )}

          {/* Reopen (resolved tickets) */}
          {!isOpen && (
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => { e.stopPropagation(); onResolve(ticket.id, "open"); }}
              disabled={resolving}
              className="gap-1.5 text-xs h-8 px-3"
            >
              {resolving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">Reopen</span>
            </Button>
          )}

          {/* Chevron */}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-muted-foreground hover:text-foreground p-1 transition-colors"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* ── Expanded body ── */}
      {expanded && (
        <div className="px-5 pb-5 space-y-4 border-t border-border pt-4">

          {/* Problem description */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Problem</p>
            <p className="text-sm leading-relaxed whitespace-pre-wrap bg-muted/30 rounded-lg p-3">
              {ticket.description}
            </p>
          </div>

          {/* ── Manual solution form ── */}
          {manualMode && isOpen && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-blue-400 uppercase tracking-wide flex items-center gap-1.5">
                <PenLine className="w-3.5 h-3.5" /> Your Solution
              </p>
              <Textarea
                placeholder="Write your solution or response to the customer here…"
                value={manualNote}
                onChange={(e) => setManualNote(e.target.value)}
                rows={5}
                className="bg-background resize-none text-sm"
                autoFocus
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleSubmitNote}
                  disabled={!manualNote.trim() || adminSolving}
                  className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
                >
                  {adminSolving
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <CheckCircle2 className="w-3.5 h-3.5" />}
                  Submit & Mark Resolved
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { setManualMode(false); setManualNote(""); }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* ── AI Response ── */}
          {ticket.aiResponse && (
            <div>
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <p className="text-xs font-semibold text-violet-400 uppercase tracking-wide flex items-center gap-1.5">
                  <Bot className="w-3.5 h-3.5" /> AI Solution
                </p>
                {ticket.aiModel && (
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${prov.color}`}>
                    {prov.label} · {ticket.aiModel}
                  </span>
                )}
              </div>
              <div className="text-sm leading-relaxed whitespace-pre-wrap bg-violet-500/10 border border-violet-500/20 rounded-lg p-3">
                {ticket.aiResponse}
              </div>
            </div>
          )}

          {/* ── Admin Note ── */}
          {ticket.adminNote && (
            <div>
              <p className="text-xs font-semibold text-blue-400 uppercase tracking-wide flex items-center gap-1.5 mb-2">
                <PenLine className="w-3.5 h-3.5" /> Admin Solution
              </p>
              <div className="text-sm leading-relaxed whitespace-pre-wrap bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                {ticket.adminNote}
              </div>
            </div>
          )}

          {/* ── Bottom action strip ── */}
          <div className="flex gap-2 flex-wrap pt-1 border-t border-border/50">
            {/* Re-generate AI (open tickets that already have aiResponse) */}
            {isOpen && ticket.aiResponse && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onAiSolve(ticket.id)}
                disabled={aiSolving || adminSolving}
                className="border-violet-500/40 text-violet-400 hover:bg-violet-500/10 gap-1.5 text-xs"
              >
                {aiSolving
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Sparkles className="w-3.5 h-3.5" />}
                Re-generate AI
              </Button>
            )}

            {/* Mark resolved (if AI answered but ticket still open, no manual mode) */}
            {isOpen && !manualMode && (ticket.aiResponse || ticket.adminNote) && (
              <Button
                size="sm"
                onClick={() => onResolve(ticket.id, "resolved")}
                disabled={resolving}
                className="gap-1.5 text-xs"
              >
                {resolving
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <CheckCircle2 className="w-3.5 h-3.5" />}
                Mark Resolved
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AdminTickets() {
  const [filter,       setFilter]       = useState<Filter>("all");
  const [search,       setSearch]       = useState("");
  const [resolvingId,  setResolvingId]  = useState<number | null>(null);
  const [aiSolvingId,  setAiSolvingId]  = useState<number | null>(null);
  const [adminSolvingId, setAdminSolvingId] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: tickets = [], isLoading } = useQuery<Ticket[]>({
    queryKey: ["admin-tickets"],
    queryFn: () => customFetch("/api/admin/tickets"),
  });

  const resolveMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      customFetch(`/api/admin/tickets/${id}/resolve`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-tickets"] });
      toast({ title: "Ticket updated" });
    },
    onError: () => toast({ title: "Failed to update ticket", variant: "destructive" }),
    onSettled: () => setResolvingId(null),
  });

  const aiSolveMutation = useMutation({
    mutationFn: (id: number) =>
      customFetch(`/api/admin/tickets/${id}/ai-solve`, { method: "POST" }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["admin-tickets"] });
      toast({
        title: "AI response generated",
        description: data?.model ? `Answered by ${data.model}` : undefined,
      });
    },
    onError: (err: any) =>
      toast({
        title: "AI solve failed",
        description: err?.message ?? "Check your AI API key in Settings",
        variant: "destructive",
      }),
    onSettled: () => setAiSolvingId(null),
  });

  const adminNoteMutation = useMutation({
    mutationFn: ({ id, adminNote }: { id: number; adminNote: string }) =>
      customFetch(`/api/admin/tickets/${id}/admin-note`, {
        method: "PUT",
        body: JSON.stringify({ adminNote }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-tickets"] });
      toast({ title: "Solution saved", description: "Ticket marked as resolved." });
    },
    onError: () => toast({ title: "Failed to save solution", variant: "destructive" }),
    onSettled: () => setAdminSolvingId(null),
  });

  const openCount     = tickets.filter((t) => t.status === "open").length;
  const resolvedCount = tickets.filter((t) => t.status === "resolved").length;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tickets.filter((t) => {
      if (filter !== "all" && t.status !== filter) return false;
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.clientName.toLowerCase().includes(q) ||
        t.clientUsername.toLowerCase().includes(q)
      );
    });
  }, [tickets, filter, search]);

  const FILTERS: { key: Filter; label: string; count?: number }[] = [
    { key: "all",      label: "All",      count: tickets.length },
    { key: "open",     label: "Open",     count: openCount      },
    { key: "resolved", label: "Resolved", count: resolvedCount  },
  ];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Customer Problems</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Review and resolve issues submitted by clients.
          </p>
        </div>
        {openCount > 0 && (
          <div className="flex items-center gap-1.5 text-amber-400 text-sm font-medium bg-amber-500/10 px-3 py-1.5 rounded-lg">
            <AlertCircle className="w-4 h-4" />
            {openCount} open
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-violet-400" />
          <span className="text-violet-400 font-medium">AI Agent</span>
          — lets the AI automatically generate a solution
        </span>
        <span className="flex items-center gap-1.5">
          <PenLine className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-blue-400 font-medium">Solve Myself</span>
          — you write and submit the solution manually
        </span>
      </div>

      {/* Support AI Agent configuration */}
      <SupportAICard />

      {/* Search + Filter row */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search by customer, title, or description…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-8 bg-background"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex gap-1.5 shrink-0">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                filter === f.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
              {f.count !== undefined && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                  filter === f.key ? "bg-white/20" : "bg-muted-foreground/20"
                }`}>
                  {f.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {search.trim() && (
        <p className="text-xs text-muted-foreground -mt-2">
          {filtered.length === 0
            ? `No results for "${search}"`
            : `${filtered.length} result${filtered.length !== 1 ? "s" : ""} for "${search}"`}
        </p>
      )}

      {/* Ticket list */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
          Loading tickets…
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground bg-card border border-border rounded-xl">
          <CheckCircle2 className="w-10 h-10 opacity-20" />
          <p className="text-sm">No {filter !== "all" ? filter : ""} tickets found.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((ticket) => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              resolving={resolvingId === ticket.id && resolveMutation.isPending}
              aiSolving={aiSolvingId === ticket.id && aiSolveMutation.isPending}
              adminSolving={adminSolvingId === ticket.id && adminNoteMutation.isPending}
              onResolve={(id, status) => {
                setResolvingId(id);
                resolveMutation.mutate({ id, status });
              }}
              onAiSolve={(id) => {
                setAiSolvingId(id);
                aiSolveMutation.mutate(id);
              }}
              onAdminNote={(id, note) => {
                setAdminSolvingId(id);
                adminNoteMutation.mutate({ id, adminNote: note });
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
