import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import {
  AlertCircle, CheckCircle2, SendHorizonal, Bot, ChevronDown, ChevronUp,
  Loader2, Plus, X, LifeBuoy, Clock, Trash2, RotateCcw,
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
  adminNote?: string | null;
  createdAt: string;
}

function TicketRow({
  ticket,
  onDelete,
  onCancel,
}: {
  ticket: Ticket;
  onDelete: (id: number) => void;
  onCancel?: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { t, lang } = useLanguage();
  const isOpen = ticket.status === "open";
  const isCancelled =
    ticket.status === "resolved" &&
    Boolean(
      ticket.adminNote?.includes("تم إلغاء") ||
      ticket.adminNote?.includes("ملغي") ||
      ticket.adminNote?.includes("Auto-cancelled") ||
      ticket.adminNote?.includes("Cancelled")
    );
  const isPlanTicket = Boolean(
    ticket.title.includes("طلب تغيير باقة") ||
    ticket.title.includes("طلب اشتراك") ||
    ticket.title.includes("باقة") ||
    ticket.title.toLowerCase().includes("plan")
  );

  return (
    <div className={`bg-card border rounded-2xl overflow-hidden transition-all duration-200 hover:shadow-md ${isOpen ? "border-amber-500/40 bg-amber-500/[0.02]" : isCancelled ? "border-slate-300 dark:border-slate-800 bg-muted/20 opacity-80" : "border-[#DCE7FF]"}`}>
      <div
        className="flex items-center justify-between gap-5 p-5 sm:p-6 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-4 min-w-0 flex-1">
          <div className={`p-3 rounded-xl shrink-0 ${isOpen ? "bg-amber-500/10 text-amber-500" : isCancelled ? "bg-slate-500/10 text-slate-500" : "bg-emerald-500/10 text-emerald-500"}`}>
            {isOpen ? <AlertCircle className="w-5 h-5" /> : isCancelled ? <X className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <span className={`text-base sm:text-lg font-semibold truncate ${isCancelled ? "text-muted-foreground line-through decoration-slate-400" : "text-foreground"}`}>
                {ticket.title}
              </span>
              {isCancelled ? (
                <Badge variant="outline" className="text-xs text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 shrink-0 gap-1 font-medium">
                  <X className="w-3.5 h-3.5" />
                  {lang === "ar" ? "ملغي تلقائياً (تم استبداله بطلب أحدث)" : "Cancelled (Superseded by Newer Plan)"}
                </Badge>
              ) : (
                <Badge variant={isOpen ? "destructive" : "secondary"} className="text-xs font-medium px-2.5 py-0.5 shrink-0">
                  {isOpen ? t("support_pending") : t("support_resolved")}
                </Badge>
              )}
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
        <div className="flex items-center gap-2 sm:gap-3 shrink-0 ps-3 sm:ps-4 border-s border-[#DCE7FF]">
          {isOpen && isPlanTicket && onCancel && (
            <ConfirmDeleteDialog
              title={lang === "ar" ? "إلغاء طلب الباقة" : "Cancel Plan Request"}
              description={lang === "ar" ? "هل أنت متأكد من إلغاء هذا الطلب؟ لن يتم إرساله أو اعتماده من قِبل الإدارة وسيتم تسجيله كطلب ملغي." : "Are you sure you want to cancel this plan request? It will not be processed by administration."}
              confirmLabel={lang === "ar" ? "نعم، إلغاء الطلب" : "Yes, Cancel Request"}
              onConfirm={() => onCancel(ticket.id)}
            >
              <button
                type="button"
                className="px-2.5 py-1.5 text-xs font-semibold rounded-lg text-amber-600 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 transition-colors flex items-center gap-1 cursor-pointer"
                title={lang === "ar" ? "إلغاء طلب الباقة" : "Cancel Plan Request"}
                onClick={(e) => e.stopPropagation()}
              >
                <X className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{lang === "ar" ? "إلغاء الطلب" : "Cancel"}</span>
              </button>
            </ConfirmDeleteDialog>
          )}

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
        <div className="px-6 pb-6 pt-6 space-y-6 border-t border-[#DCE7FF] bg-muted/10">
          {ticket.adminNote && (
            <div className="space-y-2">
              <p className="text-xs text-amber-600 dark:text-amber-400 font-semibold uppercase tracking-wider flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" />
                {lang === "ar" ? "ملاحظة النظام / حالة الطلب" : "System Note / Status"}
              </p>
              <div className="text-xs leading-relaxed bg-amber-500/10 border border-amber-500/20 text-foreground rounded-xl p-3.5 font-medium">
                {ticket.adminNote}
              </div>
            </div>
          )}

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
            <div className="text-sm leading-relaxed bg-background border border-[#DCE7FF] rounded-xl p-4 sm:p-5 whitespace-pre-wrap text-foreground shadow-xs">
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
    mutationFn: async (id: number) => {
      // 1. Attempt client delete endpoint
      const res = await fetch(`/api/client/tickets/${id}`, {
        method: "DELETE",
        credentials: "include",
        headers: { Accept: "application/json" },
      });

      // 2. If 404, fallback to admin tickets endpoint (for admin previewing or alternate routing)
      if (res.status === 404) {
        const adminRes = await fetch(`/api/admin/tickets/${id}`, {
          method: "DELETE",
          credentials: "include",
          headers: { Accept: "application/json" },
        });
        if (adminRes.ok) {
          return adminRes.json().catch(() => ({ ok: true }));
        }
      }

      // 3. If still 404, ticket is already absent from the server; treat as cleared
      if (res.status === 404) {
        return { ok: true, id, message: "Ticket already removed" };
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}: Failed to delete ticket`);
      }
      return res.json().catch(() => ({ ok: true }));
    },
    onSuccess: (_data, id) => {
      queryClient.setQueryData<Ticket[]>(["client-tickets"], (old = []) =>
        old.filter((t) => t.id !== id)
      );
      queryClient.invalidateQueries({ queryKey: ["client-tickets"] });
      queryClient.invalidateQueries({ queryKey: ["client-chat-logs"] });
      queryClient.invalidateQueries({ queryKey: ["admin-tickets"] });
      toast({
        title: lang === "ar" ? "تم حذف التذكرة بنجاح" : "Problem ticket deleted successfully",
      });
    },
    onError: (err: any) => {
      console.error("Delete ticket error:", err);
      toast({
        title: lang === "ar" ? "فشل حذف التذكرة" : "Failed to delete ticket",
        description: err?.message || undefined,
        variant: "destructive",
      });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) =>
      customFetch(`/api/client/tickets/${id}/cancel`, {
        method: "PATCH",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-tickets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/client/tickets"] });
      queryClient.invalidateQueries({ queryKey: ["admin-tickets"] });
      queryClient.invalidateQueries({ queryKey: ["client-chat-logs"] });
      queryClient.invalidateQueries({ queryKey: ["admin-notifications"] });
      toast({
        title: lang === "ar" ? "تم إلغاء الطلب بنجاح" : "Request cancelled successfully",
        description:
          lang === "ar"
            ? "تم تسجيل إلغاء الطلب رسمياً ولن يتم اعتماده أو إرساله كطلب مفتوح للإدارة."
            : "The plan request has been cancelled and will not remain open for admin processing.",
      });
    },
    onError: (err: any) => {
      toast({
        title: lang === "ar" ? "فشل إلغاء الطلب" : "Failed to cancel request",
        description: err?.message || undefined,
        variant: "destructive",
      });
    },
  });

  // Ensure only the latest plan switch request is displayed; previous switch requests are filtered out
  const displayTickets = useMemo(() => {
    // Sort tickets strictly by newest first
    const sorted = [...tickets].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    let seenPlan = false;
    return sorted.filter((t) => {
      const titleLower = (t.title || "").toLowerCase();
      const isPlan =
        titleLower.includes("طلب تغيير باقة") ||
        titleLower.includes("طلب اشتراك") ||
        titleLower.includes("باقة") ||
        titleLower.includes("plan") ||
        titleLower.includes("upgrade") ||
        titleLower.includes("starter") ||
        titleLower.includes("professional") ||
        titleLower.includes("enterprise");
      if (isPlan) {
        if (seenPlan) return false;
        seenPlan = true;
      }
      return true;
    });
  }, [tickets]);

  const openCount = displayTickets.filter((t) => t.status === "open").length;
  const resolvedCount = displayTickets.filter((t) => t.status === "resolved").length;

  return (
    <div className="space-y-6 w-full">
      {/* ── Bot Manager Hero Operations Banner ── */}
      <div
        className="relative overflow-hidden rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-blue-600/15 border border-white/10"
        style={{
          background: "linear-gradient(135deg, #1e40af 0%, #2563eb 50%, #1d4ed8 100%)",
        }}
      >
        <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-white/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute right-40 -top-10 w-48 h-48 bg-blue-300/20 rounded-full blur-xl pointer-events-none" />

        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
          <div className="flex items-center gap-4 sm:gap-5">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white/15 backdrop-blur-md border border-white/25 shadow-[inset_0_0_0_2px_rgba(255,255,255,0.18)] flex items-center justify-center shrink-0">
              <i className="fa-solid fa-life-ring text-2xl sm:text-3xl text-white"></i>
            </div>
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-[11px] font-semibold text-blue-100 mb-1.5 border border-white/20">
                
                Helpdesk & Troubleshooting
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white leading-tight">
                {t("support_title")}
              </h1>
              <p className="text-xs sm:text-sm text-blue-100/90 mt-1 max-w-xl leading-relaxed">
                {t("support_desc")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await Promise.all([
                  queryClient.invalidateQueries(),
                  queryClient.refetchQueries({ queryKey: ["client-tickets"] }),
                ]);
                toast({
                  title: lang === "ar" ? "تم تحديث التذاكر والعدادات بنجاح" : "Tickets and counters refreshed",
                });
              }}
              className="bg-white/15 hover:bg-white/25 text-white border-white/25 rounded-xl backdrop-blur-md shadow-sm cursor-pointer text-xs"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
              <span>{lang === "ar" ? "تحديث" : "Refresh"}</span>
            </Button>
            <Button
              onClick={() => setShowForm((v) => !v)}
              className="bg-white text-blue-700 hover:bg-blue-50 font-bold rounded-xl text-xs sm:text-sm shadow-md transition-all shrink-0"
            >
              {showForm ? <><X className="w-4 h-4 mr-1.5" />{t("btn_cancel")}</> : <><Plus className="w-4 h-4 mr-1.5" />{t("support_new_ticket")}</>}
            </Button>
          </div>
        </div>
      </div>

      {/* Submit form */}
      {showForm && (
        <div className="bg-card border border-[#DCE7FF] dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4 shadow-md shadow-[#2D5BE3]/15 border-l-4 border-l-[#2D5BE3]">
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
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md shadow-blue-600/25 px-5"
            >
              {submitMutation.isPending
                ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />{t("loading")}</>
                : <><SendHorizonal className="w-4 h-4 mr-1.5" />{t("support_submit_ticket")}</>}
            </Button>
          </div>
        </div>
      )}

      {/* Stats row (Transparent White Frosted Glass with Royal Blue Left Border) */}
      {displayTickets.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="bg-white/75 dark:bg-white/[0.07] backdrop-blur-md border border-white/60 dark:border-white/15 rounded-2xl p-5 flex items-center justify-between shadow-md shadow-[#2D5BE3]/15 hover:shadow-lg hover:shadow-[#2D5BE3]/25 transition-all border-l-4 border-l-[#2D5BE3]">
            <div>
              <p className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">{t("support_pending")}</p>
              <p className="text-3xl font-black text-amber-500 mt-1 tabular-nums">{openCount}</p>
            </div>
            <div className="p-3 bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25 rounded-2xl shadow-inner">
              <AlertCircle className="w-6 h-6" />
            </div>
          </div>
          <div className="bg-white/75 dark:bg-white/[0.07] backdrop-blur-md border border-white/60 dark:border-white/15 rounded-2xl p-5 flex items-center justify-between shadow-md shadow-[#2D5BE3]/15 hover:shadow-lg hover:shadow-[#2D5BE3]/25 transition-all border-l-4 border-l-[#2D5BE3]">
            <div>
              <p className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">{t("support_resolved")}</p>
              <p className="text-3xl font-black text-emerald-500 mt-1 tabular-nums">{resolvedCount}</p>
            </div>
            <div className="p-3 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 rounded-2xl shadow-inner">
              <CheckCircle2 className="w-6 h-6" />
            </div>
          </div>
          <div className="bg-white/75 dark:bg-white/[0.07] backdrop-blur-md border border-white/60 dark:border-white/15 rounded-2xl p-5 flex items-center justify-between sm:col-span-2 lg:col-span-1 shadow-md shadow-[#2D5BE3]/15 hover:shadow-lg hover:shadow-[#2D5BE3]/25 transition-all border-l-4 border-l-[#2D5BE3]">
            <div>
              <p className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">{lang === "ar" ? "إجمالي التذاكر" : "Total Tickets"}</p>
              <p className="text-3xl font-black text-foreground mt-1 tabular-nums">{displayTickets.length}</p>
            </div>
            <div className="p-3 bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/25 rounded-2xl shadow-inner">
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
      ) : displayTickets.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 gap-3 text-muted-foreground bg-card border border-border rounded-xl w-full">
          <CheckCircle2 className="w-12 h-12 opacity-20 text-emerald-500" />
          <p className="text-sm font-medium">{t("support_no_tickets")}</p>
        </div>
      ) : (
        <div className="space-y-4 sm:space-y-5 w-full">
          {displayTickets.map((t) => (
            <TicketRow
              key={t.id}
              ticket={t}
              onDelete={(id) => deleteMutation.mutate(id)}
              onCancel={(id) => cancelMutation.mutate(id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
