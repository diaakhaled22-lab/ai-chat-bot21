import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import {
  AlertCircle, CheckCircle2, SendHorizonal, Bot, ChevronDown, ChevronUp,
  Loader2, Plus, X, LifeBuoy, Clock, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";

interface Ticket {
  id: number;
  title: string;
  description: string;
  status: "open" | "resolved";
  aiResponse: string | null;
  createdAt: string;
}

function TicketRow({
  ticket,
  onDelete,
}: {
  ticket: Ticket;
  onDelete: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { t, lang } = useLanguage();
  const isOpen = ticket.status === "open";

  return (
    <div className={`bg-card border rounded-2xl overflow-hidden transition-all duration-200 hover:shadow-md ${isOpen ? "border-amber-500/40 bg-amber-500/[0.02]" : "border-border/80"}`}>
      <div
        className="flex items-center justify-between gap-5 p-5 sm:p-6 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-4 min-w-0 flex-1">
          <div className={`p-3 rounded-xl shrink-0 ${isOpen ? "bg-amber-500/10 text-amber-500" : "bg-emerald-500/10 text-emerald-500"}`}>
            {isOpen ? <AlertCircle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-base sm:text-lg font-semibold truncate text-foreground">{ticket.title}</span>
              <Badge variant={isOpen ? "destructive" : "secondary"} className="text-xs font-medium px-2.5 py-0.5 shrink-0">
                {isOpen ? t("support_pending") : t("support_resolved")}
              </Badge>
              {ticket.aiResponse && (
                <Badge variant="outline" className="text-xs text-violet-500 border-violet-500/30 bg-violet-500/5 px-2.5 py-0.5 shrink-0 gap-1.5 font-medium">
                  <Bot className="w-3.5 h-3.5" />{lang === "ar" ? "تم الرد بالذكاء الاصطناعي" : "AI Solved"}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-2.5 flex items-center gap-3 flex-wrap">
              <span className="font-mono bg-muted/60 px-1.5 py-0.5 rounded">#{ticket.id}</span>
              <span>•</span>
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-muted-foreground/70" />
                <span>{new Date(ticket.createdAt).toLocaleString(lang === "ar" ? "ar-EG" : "en-US", { dateStyle: "medium", timeStyle: "short" })}</span>
              </span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0 ps-3 sm:ps-4 border-s border-border/50">
          <ConfirmDeleteDialog
            title={lang === "ar" ? "حذف تذكرة المشكلة" : "Delete Problem Ticket"}
            description={lang === "ar" ? "هل أنت متأكد من حذف هذه التذكرة والرسالة الخاصة بها نهائياً؟" : "Are you sure you want to permanently delete this problem ticket and message?"}
            onConfirm={() => onDelete(ticket.id)}
          >
            <button
              type="button"
              className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              title={lang === "ar" ? "حذف المشكلة" : "Delete problem"}
              onClick={(e) => e.stopPropagation()}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </ConfirmDeleteDialog>
          <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:bg-muted">
            {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="px-6 pb-6 pt-6 space-y-6 border-t border-border/60 bg-muted/10">
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-1.5 border-b border-border/40">
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">{t("support_your_problem")}</p>
              <ConfirmDeleteDialog
                title={lang === "ar" ? "حذف تذكرة المشكلة" : "Delete Problem Ticket"}
                description={lang === "ar" ? "هل أنت متأكد من حذف هذه التذكرة والرسالة الخاصة بها نهائياً؟" : "Are you sure you want to delete this problem ticket?"}
                onConfirm={() => onDelete(ticket.id)}
              >
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1.5 transition-colors px-2.5 py-1 rounded-md hover:bg-destructive/10"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{lang === "ar" ? "حذف التذكرة" : "Delete Ticket"}</span>
                </button>
              </ConfirmDeleteDialog>
            </div>
            <div className="text-sm leading-relaxed bg-background border border-border/80 rounded-xl p-4 sm:p-5 whitespace-pre-wrap text-foreground shadow-xs">
              {ticket.description}
            </div>
          </div>
          {ticket.aiResponse && (
            <div className="space-y-3 pt-2">
              <div className="pb-1.5 border-b border-border/40">
                <p className="text-xs text-violet-500 font-semibold flex items-center gap-2 uppercase tracking-wider">
                  <Bot className="w-4 h-4" /> {t("support_ai_solution")}
                </p>
              </div>
              <div className="text-sm leading-relaxed bg-violet-500/[0.07] border border-violet-500/25 rounded-xl p-4 sm:p-5 whitespace-pre-wrap text-foreground shadow-xs">
                {ticket.aiResponse}
              </div>
            </div>
          )}
          {isOpen && !ticket.aiResponse && (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs sm:text-sm text-amber-600 dark:text-amber-400 mt-2">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{t("support_admin_pending")}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ClientSupport() {
  const { t, lang } = useLanguage();
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
      toast({ title: lang === "ar" ? "تم إرسال المشكلة للمسؤول بنجاح" : "Problem sent to admin" });
      setTitle("");
      setDescription("");
      setShowForm(false);
    },
    onError: () => toast({ title: lang === "ar" ? "فشل إرسال المشكلة" : "Failed to submit problem", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      customFetch(`/api/client/tickets/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-tickets"] });
      toast({ title: lang === "ar" ? "تم حذف التذكرة بنجاح" : "Problem ticket deleted successfully" });
    },
    onError: () => {
      toast({ title: lang === "ar" ? "فشل حذف التذكرة" : "Failed to delete ticket", variant: "destructive" });
    },
  });

  const openCount = tickets.filter((t) => t.status === "open").length;
  const resolvedCount = tickets.filter((t) => t.status === "resolved").length;

  return (
    <div className="space-y-6 w-full">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-border/50">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{t("support_title")}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {t("support_desc")}
          </p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)} variant={showForm ? "outline" : "default"} size="sm" className="shrink-0">
          {showForm ? <><X className="w-4 h-4 mr-1.5" />{t("btn_cancel")}</> : <><Plus className="w-4 h-4 mr-1.5" />{t("support_new_ticket")}</>}
        </Button>
      </div>

      {/* Submit form */}
      {showForm && (
        <div className="bg-card border border-border rounded-xl p-5 sm:p-6 space-y-4 shadow-sm">
          <h2 className="font-semibold text-sm sm:text-base">{t("support_new_ticket")}</h2>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1 block">{t("support_ticket_title")}</label>
              <Input
                placeholder={t("support_ticket_title_placeholder")}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="bg-background h-10"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1 block">{t("support_ticket_desc")}</label>
              <textarea
                placeholder={t("support_ticket_desc_placeholder")}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring resize-none leading-relaxed"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>
              {t("btn_cancel")}
            </Button>
            <Button
              onClick={() => submitMutation.mutate()}
              disabled={!title.trim() || !description.trim() || submitMutation.isPending}
              size="sm"
            >
              {submitMutation.isPending
                ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />{t("loading")}</>
                : <><SendHorizonal className="w-4 h-4 mr-1.5" />{t("support_submit_ticket")}</>}
            </Button>
          </div>
        </div>
      )}

      {/* Stats row - fills width in responsive grid */}
      {tickets.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="bg-card border border-amber-500/30 bg-amber-500/[0.04] rounded-xl p-4 sm:p-5 flex items-center justify-between shadow-xs">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("support_pending")}</p>
              <p className="text-3xl font-bold text-amber-500 mt-1">{openCount}</p>
            </div>
            <div className="p-3 bg-amber-500/10 text-amber-500 rounded-xl">
              <AlertCircle className="w-6 h-6" />
            </div>
          </div>
          <div className="bg-card border border-emerald-500/30 bg-emerald-500/[0.04] rounded-xl p-4 sm:p-5 flex items-center justify-between shadow-xs">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("support_resolved")}</p>
              <p className="text-3xl font-bold text-emerald-500 mt-1">{resolvedCount}</p>
            </div>
            <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-xl">
              <CheckCircle2 className="w-6 h-6" />
            </div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 sm:p-5 flex items-center justify-between sm:col-span-2 lg:col-span-1 shadow-xs">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{lang === "ar" ? "إجمالي التذاكر" : "Total Tickets"}</p>
              <p className="text-3xl font-bold text-foreground mt-1">{tickets.length}</p>
            </div>
            <div className="p-3 bg-primary/10 text-primary rounded-xl">
              <LifeBuoy className="w-6 h-6" />
            </div>
          </div>
        </div>
      )}

      {/* Tickets list */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48 text-muted-foreground text-sm gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>{t("loading")}</span>
        </div>
      ) : tickets.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 gap-3 text-muted-foreground bg-card border border-border rounded-xl w-full">
          <CheckCircle2 className="w-12 h-12 opacity-20 text-emerald-500" />
          <p className="text-sm font-medium">{t("support_no_tickets")}</p>
        </div>
      ) : (
        <div className="space-y-4 sm:space-y-5 w-full">
          {tickets.map((t) => (
            <TicketRow
              key={t.id}
              ticket={t}
              onDelete={(id) => deleteMutation.mutate(id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
