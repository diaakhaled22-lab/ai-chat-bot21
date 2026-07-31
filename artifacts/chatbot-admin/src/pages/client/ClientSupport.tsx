import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import {
  AlertCircle, CheckCircle2, SendHorizonal, Bot, ChevronDown, ChevronUp,
  Loader2, Plus, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

interface Ticket {
  id: number;
  title: string;
  description: string;
  status: "open" | "resolved";
  aiResponse: string | null;
  createdAt: string;
}

function TicketRow({ ticket }: { ticket: Ticket }) {
  const [expanded, setExpanded] = useState(false);
  const isOpen = ticket.status === "open";

  return (
    <div className={`bg-card border rounded-xl overflow-hidden ${isOpen ? "border-amber-500/30" : "border-emerald-500/20"}`}>
      <div
        className="flex items-start gap-3 p-4 cursor-pointer hover:bg-muted/20 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className={`mt-0.5 shrink-0 ${isOpen ? "text-amber-400" : "text-emerald-400"}`}>
          {isOpen ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{ticket.title}</span>
            <Badge variant={isOpen ? "destructive" : "secondary"} className="text-[10px] shrink-0">
              {isOpen ? "Pending" : "Resolved"}
            </Badge>
            {ticket.aiResponse && (
              <Badge variant="outline" className="text-[10px] text-violet-400 border-violet-500/30 shrink-0">
                <Bot className="w-2.5 h-2.5 mr-1" />AI
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {new Date(ticket.createdAt).toLocaleDateString()}
          </p>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
          <div>
            <p className="text-xs text-muted-foreground font-medium mb-1">Your problem</p>
            <p className="text-sm leading-relaxed bg-muted/30 rounded-lg p-3 whitespace-pre-wrap">{ticket.description}</p>
          </div>
          {ticket.aiResponse && (
            <div>
              <p className="text-xs text-violet-400 font-medium mb-1 flex items-center gap-1">
                <Bot className="w-3 h-3" /> AI Solution from Admin
              </p>
              <div className="text-sm leading-relaxed bg-violet-500/10 border border-violet-500/20 rounded-lg p-3 whitespace-pre-wrap">
                {ticket.aiResponse}
              </div>
            </div>
          )}
          {isOpen && !ticket.aiResponse && (
            <p className="text-xs text-muted-foreground italic">Admin will review and respond shortly.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function ClientSupport() {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: tickets = [], isLoading } = useQuery<Ticket[]>({
    queryKey: ["client-tickets"],
    queryFn: () => customFetch("/api/client/tickets"),
  });

  const submitMutation = useMutation({
    mutationFn: () =>
      customFetch("/api/client/tickets", {
        method: "POST",
        body: JSON.stringify({ title, description }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-tickets"] });
      toast({ title: "Problem sent to admin" });
      setTitle("");
      setDescription("");
      setShowForm(false);
    },
    onError: () => toast({ title: "Failed to submit problem", variant: "destructive" }),
  });

  const openCount = tickets.filter((t) => t.status === "open").length;
  const resolvedCount = tickets.filter((t) => t.status === "resolved").length;

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Support</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Submit problems to the admin team for assistance.
          </p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)} variant={showForm ? "outline" : "default"} size="sm">
          {showForm ? <><X className="w-4 h-4 mr-1.5" />Cancel</> : <><Plus className="w-4 h-4 mr-1.5" />Send Problem</>}
        </Button>
      </div>

      {/* Submit form */}
      {showForm && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-sm">Describe your problem</h2>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1 block">Title</label>
              <Input
                placeholder="Brief summary of the problem"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="bg-background"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1 block">Details</label>
              <textarea
                placeholder="Describe the problem in detail…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring resize-none"
              />
            </div>
          </div>
          <Button
            onClick={() => submitMutation.mutate()}
            disabled={!title.trim() || !description.trim() || submitMutation.isPending}
            size="sm"
          >
            {submitMutation.isPending
              ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Sending…</>
              : <><SendHorizonal className="w-4 h-4 mr-1.5" />Send to Admin</>}
          </Button>
        </div>
      )}

      {/* Stats row */}
      {tickets.length > 0 && (
        <div className="flex gap-3">
          <div className="flex-1 bg-card border border-amber-500/20 rounded-lg px-4 py-3 text-center">
            <p className="text-2xl font-bold text-amber-400">{openCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Pending</p>
          </div>
          <div className="flex-1 bg-card border border-emerald-500/20 rounded-lg px-4 py-3 text-center">
            <p className="text-2xl font-bold text-emerald-400">{resolvedCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Resolved</p>
          </div>
        </div>
      )}

      {/* Tickets list */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">Loading…</div>
      ) : tickets.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 gap-3 text-muted-foreground bg-card border border-border rounded-xl">
          <CheckCircle2 className="w-10 h-10 opacity-20" />
          <p className="text-sm">No problems submitted yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map((t) => <TicketRow key={t.id} ticket={t} />)}
        </div>
      )}
    </div>
  );
}
