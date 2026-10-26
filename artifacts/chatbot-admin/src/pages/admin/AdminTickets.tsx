import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import {
  AlertCircle, CheckCircle2, Clock, Bot, ChevronDown, ChevronUp,
  Sparkles, Loader2, User, Calendar, Search, X, PenLine, RotateCcw,
  Trash2, Copy, Check, Download, RefreshCw, Edit3, ShieldAlert,
  UserCheck, TrendingUp, LifeBuoy,
} from "lucide-react";
import SupportAICard from "@/components/SupportAICard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";

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

type Filter = "all" | "open" | "resolved" | "ai_solved" | "manual_solved";
type SortOrder = "newest" | "oldest";

function formatRelativeTime(dateStr: string, lang: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return lang === "ar" ? "الآن" : "Just now";
  if (mins < 60) return lang === "ar" ? `منذ ${mins} دقيقة` : `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return lang === "ar" ? `منذ ${hours} ساعة` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return lang === "ar" ? `منذ ${days} يوم` : `${days}d ago`;
  return new Date(dateStr).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US");
}

function exportTicketsToCsv(tickets: Ticket[], lang: string) {
  const headers = lang === "ar"
    ? ["المعرف", "اسم العميل", "اسم المستخدم", "عنوان المشكلة", "الوصف", "الحالة", "حل الذكاء الاصطناعي", "الموديل", "حل الأدمن", "تاريخ الإنشاء"]
    : ["ID", "Client Name", "Username", "Title", "Description", "Status", "AI Solution", "AI Model", "Admin Note", "Created At"];

  const escapeCsv = (val: any) => `"${String(val ?? "").replace(/"/g, '""')}"`;

  const rows = tickets.map((t) => [
    t.id,
    escapeCsv(t.clientName),
    escapeCsv(t.clientUsername),
    escapeCsv(t.title),
    escapeCsv(t.description),
    t.status,
    escapeCsv(t.aiResponse),
    escapeCsv(t.aiModel),
    escapeCsv(t.adminNote),
    escapeCsv(t.createdAt),
  ]);

  const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", `customer-problems-${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ─── TicketCard ───────────────────────────────────────────────────────────────
function TicketCard({
  ticket,
  onResolve,
  onAiSolve,
  onAdminNote,
  onUpdateSolution,
  onDelete,
  resolving,
  aiSolving,
  adminSolving,
  updatingSolution,
  deleting,
}: {
  ticket: Ticket;
  onResolve:        (id: number, status: "open" | "resolved") => void;
  onAiSolve:        (id: number) => void;
  onAdminNote:      (id: number, note: string) => void;
  onUpdateSolution: (id: number, payload: { aiResponse?: string; adminNote?: string }) => void;
  onDelete:         (id: number) => void;
  resolving:        boolean;
  aiSolving:        boolean;
  adminSolving:     boolean;
  updatingSolution: boolean;
  deleting:         boolean;
}) {
  const { lang } = useLanguage();
  const { toast } = useToast();
  const [expanded,    setExpanded]    = useState(false);
  const [manualMode,  setManualMode]  = useState(false);
  const [manualNote,  setManualNote]  = useState("");
  const [editMode,    setEditMode]    = useState(false);
  const [editText,    setEditText]    = useState("");
  const [editTarget,  setEditTarget]  = useState<"ai" | "admin">("ai");
  const [copiedType,  setCopiedType]  = useState<string | null>(null);

  const isOpen = ticket.status === "open";

  function copyText(text: string, type: string) {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    toast({
      title: lang === "ar" ? "تم النسخ" : "Copied!",
      description: lang === "ar" ? "تم نسخ النص إلى الحافظة." : "Copied to clipboard.",
    });
    setTimeout(() => setCopiedType(null), 2000);
  }

  function handleAiSolve(e: React.MouseEvent) {
    e.stopPropagation();
    setManualMode(false);
    setEditMode(false);
    onAiSolve(ticket.id);
    setExpanded(true);
  }

  function handleManualClick(e: React.MouseEvent) {
    e.stopPropagation();
    setManualMode(true);
    setEditMode(false);
    setManualNote(ticket.adminNote || "");
    setExpanded(true);
  }

  function handleSubmitNote() {
    if (!manualNote.trim()) return;
    onAdminNote(ticket.id, manualNote);
    setManualMode(false);
  }

  function startEdit(target: "ai" | "admin") {
    setEditTarget(target);
    setEditText(target === "ai" ? (ticket.aiResponse || "") : (ticket.adminNote || ""));
    setEditMode(true);
    setManualMode(false);
  }

  function handleSaveEdit() {
    if (editTarget === "ai") {
      onUpdateSolution(ticket.id, { aiResponse: editText });
    } else {
      onUpdateSolution(ticket.id, { adminNote: editText });
    }
    setEditMode(false);
  }

  const prov = PROVIDER_LABELS[ticket.aiProvider ?? ""] ?? {
    label: ticket.aiProvider ?? "AI",
    color: "text-violet-400 bg-violet-500/10 border-violet-500/30",
  };

  return (
    <div className={`bg-card border rounded-xl overflow-hidden transition-all shadow-sm border-l-4 border-l-[#2D5BE3] ${
      isOpen ? "border-amber-500/40 hover:border-amber-500/60" : "border-border/60 hover:border-primary/40"
    }`}>

      {/* ── Header row ── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 p-4">
        <div className="flex items-start gap-3 flex-1 min-w-0 w-full">
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
              <span className="font-mono text-xs text-muted-foreground/80 font-bold">#{ticket.id}</span>
              <h3 className="font-semibold text-sm truncate">{ticket.title}</h3>
              <Badge
                variant={isOpen ? "destructive" : "secondary"}
                className="text-[10px] shrink-0 font-medium"
              >
                {isOpen ? (lang === "ar" ? "قيد الانتظار" : "Open") : (lang === "ar" ? "تم الحل" : "Resolved")}
              </Badge>
              {ticket.aiResponse && (
                <span className="inline-flex items-center gap-1 text-[10px] text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded-full border border-violet-500/20 font-medium">
                  <Bot className="w-3 h-3" /> {lang === "ar" ? "ذكاء اصطناعي" : "AI"}
                </span>
              )}
              {ticket.adminNote && (
                <span className="inline-flex items-center gap-1 text-[10px] text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20 font-medium">
                  <PenLine className="w-3 h-3" /> {lang === "ar" ? "يدوي" : "Manual"}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1 font-medium text-foreground/80">
                <User className="w-3 h-3 text-muted-foreground" />
                {ticket.clientName}
                {ticket.clientUsername && (
                  <span className="text-[11px] text-muted-foreground font-normal">(@{ticket.clientUsername})</span>
                )}
              </span>
              <span className="opacity-50">·</span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-muted-foreground" />
                <span title={new Date(ticket.createdAt).toLocaleString()}>
                  {formatRelativeTime(ticket.createdAt, lang)}
                </span>
              </span>
              {ticket.aiModel && (
                <>
                  <span className="opacity-50">·</span>
                  <span className={`inline-flex min-w-0 max-w-[220px] sm:max-w-xs items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-medium ${prov.color}`}>
                    <span className="shrink-0">{prov.label} · </span><span className="truncate">{ticket.aiModel}</span>
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── Action buttons ── */}
        <div className="shrink-0 flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
          {isOpen && (
            <>
              {/* AI Solve Button */}
              <Button
                size="sm"
                variant="outline"
                onClick={handleAiSolve}
                disabled={aiSolving || adminSolving}
                title={lang === "ar" ? "حل المشكلة بالذكاء الاصطناعي" : "Let the AI agent solve this problem"}
                className="border-violet-500/40 text-violet-400 hover:bg-violet-500/10 gap-1.5 text-xs h-8 px-3"
              >
                {aiSolving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                <span>{lang === "ar" ? "حل بالـ AI" : "AI Agent"}</span>
              </Button>

              {/* Manual Solve Button */}
              <Button
                size="sm"
                variant="outline"
                onClick={handleManualClick}
                disabled={aiSolving || adminSolving}
                title={lang === "ar" ? "حل يدوي" : "Solve manually"}
                className="border-blue-500/40 text-blue-400 hover:bg-blue-500/10 gap-1.5 text-xs h-8 px-3"
              >
                {adminSolving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PenLine className="w-3.5 h-3.5" />}
                <span>{lang === "ar" ? "حل يدوي" : "Solve Myself"}</span>
              </Button>
            </>
          )}

          {/* Reopen button for resolved tickets */}
          {!isOpen && (
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => { e.stopPropagation(); onResolve(ticket.id, "open"); }}
              disabled={resolving}
              className="gap-1.5 text-xs h-8 px-3"
            >
              {resolving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
              <span>{lang === "ar" ? "إعادة فتح" : "Reopen"}</span>
            </Button>
          )}

          {/* Delete Ticket Dialog */}
          <ConfirmDeleteDialog
            onConfirm={() => onDelete(ticket.id)}
            title={lang === "ar" ? `حذف المشكلة #${ticket.id}؟` : `Delete Problem #${ticket.id}?`}
            description={lang === "ar"
              ? "هل أنت متأكد من حذف هذه المشكلة نهائياً من سجلات النظام؟"
              : "Are you sure you want to permanently delete this customer problem?"}
          >
            <Button
              size="sm"
              variant="ghost"
              disabled={deleting}
              className="text-muted-foreground hover:text-destructive h-8 w-8 p-0"
              title={lang === "ar" ? "حذف التذكرة" : "Delete ticket"}
            >
              {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            </Button>
          </ConfirmDeleteDialog>

          {/* Expand Chevron */}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-muted-foreground hover:text-foreground p-1 transition-colors"
            title={expanded ? (lang === "ar" ? "طي التفاصيل" : "Collapse") : (lang === "ar" ? "عرض التفاصيل" : "Expand")}
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* ── Expanded body ── */}
      {expanded && (
        <div className="px-5 pb-5 space-y-4 border-t border-border/60 pt-4 bg-muted/5">

          {/* Problem description */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                {lang === "ar" ? "تفاصيل المشكلة المشكو منها" : "Problem Description"}
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[11px] gap-1 px-2 text-muted-foreground"
                onClick={() => copyText(ticket.description, "desc")}
              >
                {copiedType === "desc" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                {copiedType === "desc" ? (lang === "ar" ? "تم النسخ" : "Copied") : (lang === "ar" ? "نسخ" : "Copy")}
              </Button>
            </div>
            <p className="text-sm leading-relaxed whitespace-pre-wrap bg-card border border-border/60 rounded-xl p-3.5">
              {ticket.description}
            </p>
          </div>

          {/* ── Manual solution form (when writing new solution) ── */}
          {manualMode && isOpen && (
            <div className="space-y-3 bg-blue-500/5 border border-blue-500/20 rounded-xl p-4">
              <p className="text-xs font-semibold text-blue-400 uppercase tracking-wide flex items-center gap-1.5">
                <PenLine className="w-3.5 h-3.5" />
                {lang === "ar" ? "كتابة حل يدوي للعميل" : "Your Manual Solution"}
              </p>
              <Textarea
                placeholder={lang === "ar" ? "اكتب الحل أو الرد الموجه للعميل هنا..." : "Write your solution or response to the customer here…"}
                value={manualNote}
                onChange={(e) => setManualNote(e.target.value)}
                rows={5}
                className="bg-card resize-none text-sm"
                autoFocus
              />
              <div className="flex gap-2 flex-wrap">
                <Button
                  size="sm"
                  onClick={handleSubmitNote}
                  disabled={!manualNote.trim() || adminSolving}
                  className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5 text-xs"
                >
                  {adminSolving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  {lang === "ar" ? "حفظ وتعيين المشكلة كمحلولة" : "Submit & Mark Resolved"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { setManualMode(false); setManualNote(""); }}
                  className="text-xs"
                >
                  {lang === "ar" ? "إلغاء" : "Cancel"}
                </Button>
              </div>
            </div>
          )}

          {/* ── Edit solution inline mode ── */}
          {editMode && (
            <div className="space-y-3 bg-primary/5 border border-primary/30 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-primary uppercase tracking-wide flex items-center gap-1.5">
                  <Edit3 className="w-3.5 h-3.5" />
                  {lang === "ar" ? `تعديل حل (${editTarget === "ai" ? "الذكاء الاصطناعي" : "الأدمن"})` : `Edit Solution (${editTarget.toUpperCase()})`}
                </p>
              </div>
              <Textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                rows={6}
                className="bg-card resize-none text-sm"
                autoFocus
              />
              <div className="flex gap-2 flex-wrap">
                <Button
                  size="sm"
                  onClick={handleSaveEdit}
                  disabled={updatingSolution}
                  className="gap-1.5 text-xs"
                >
                  {updatingSolution ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  {lang === "ar" ? "حفظ التعديلات" : "Save Changes"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditMode(false)}
                  className="text-xs"
                >
                  {lang === "ar" ? "إلغاء" : "Cancel"}
                </Button>
              </div>
            </div>
          )}

          {/* ── AI Response Display ── */}
          {ticket.aiResponse && !editMode && (
            <div className="bg-violet-500/5 border border-violet-500/20 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold text-violet-400 uppercase tracking-wide flex items-center gap-1.5">
                    <Bot className="w-3.5 h-3.5" />
                    {lang === "ar" ? "حل الذكاء الاصطناعي (AI Solution)" : "AI Solution"}
                  </p>
                  {ticket.aiModel && (
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${prov.color}`}>
                      <span className="shrink-0">{prov.label} · </span><span className="truncate">{ticket.aiModel}</span>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[11px] gap-1 px-2 text-violet-400 hover:text-violet-300 hover:bg-violet-500/10"
                    onClick={() => copyText(ticket.aiResponse!, "ai")}
                  >
                    {copiedType === "ai" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    {copiedType === "ai" ? (lang === "ar" ? "تم النسخ" : "Copied") : (lang === "ar" ? "نسخ الحل" : "Copy")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[11px] gap-1 px-2 text-muted-foreground hover:text-foreground"
                    onClick={() => startEdit("ai")}
                    title={lang === "ar" ? "تعديل الرد" : "Edit response"}
                  >
                    <Edit3 className="w-3 h-3" />
                    {lang === "ar" ? "تعديل" : "Edit"}
                  </Button>
                </div>
              </div>

              <div className="text-sm leading-relaxed whitespace-pre-wrap bg-card border border-violet-500/20 rounded-lg p-3">
                {ticket.aiResponse}
              </div>
            </div>
          )}

          {/* ── Admin Note Display ── */}
          {ticket.adminNote && !editMode && (
            <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-xs font-semibold text-blue-400 uppercase tracking-wide flex items-center gap-1.5">
                  <PenLine className="w-3.5 h-3.5" />
                  {lang === "ar" ? "حل المشرف (Admin Solution)" : "Admin Solution"}
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[11px] gap-1 px-2 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
                    onClick={() => copyText(ticket.adminNote!, "admin")}
                  >
                    {copiedType === "admin" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    {copiedType === "admin" ? (lang === "ar" ? "تم النسخ" : "Copied") : (lang === "ar" ? "نسخ" : "Copy")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[11px] gap-1 px-2 text-muted-foreground hover:text-foreground"
                    onClick={() => startEdit("admin")}
                    title={lang === "ar" ? "تعديل الرد" : "Edit response"}
                  >
                    <Edit3 className="w-3 h-3" />
                    {lang === "ar" ? "تعديل" : "Edit"}
                  </Button>
                </div>
              </div>

              <div className="text-sm leading-relaxed whitespace-pre-wrap bg-card border border-blue-500/20 rounded-lg p-3">
                {ticket.adminNote}
              </div>
            </div>
          )}

          {/* ── Bottom action strip ── */}
          <div className="flex gap-2 flex-wrap pt-2 border-t border-border/50 items-center justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Re-generate AI (tickets that already have aiResponse) */}
              {isOpen && ticket.aiResponse && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onAiSolve(ticket.id)}
                  disabled={aiSolving || adminSolving}
                  className="border-violet-500/40 text-violet-400 hover:bg-violet-500/10 gap-1.5 text-xs h-8"
                >
                  {aiSolving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  {lang === "ar" ? "إعادة التوليد بالـ AI" : "Re-generate AI"}
                </Button>
              )}

              {/* Mark resolved button if open */}
              {isOpen && !manualMode && (ticket.aiResponse || ticket.adminNote) && (
                <Button
                  size="sm"
                  onClick={() => onResolve(ticket.id, "resolved")}
                  disabled={resolving}
                  className="gap-1.5 text-xs h-8 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {resolving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  {lang === "ar" ? "تعيين كمحلولة" : "Mark Resolved"}
                </Button>
              )}
            </div>

            <div className="text-[11px] text-muted-foreground">
              {lang === "ar" ? "آخر تحديث: " : "Updated: "}
              {new Date(ticket.updatedAt || ticket.createdAt).toLocaleString()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AdminTickets() {
  const { lang } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [filter,          setFilter]          = useState<Filter>("all");
  const [clientFilter,    setClientFilter]    = useState<string>("all");
  const [sortOrder,       setSortOrder]       = useState<SortOrder>("newest");
  const [search,          setSearch]          = useState("");
  const [resolvingId,     setResolvingId]     = useState<number | null>(null);
  const [aiSolvingId,     setAiSolvingId]     = useState<number | null>(null);
  const [adminSolvingId,  setAdminSolvingId]  = useState<number | null>(null);
  const [updatingId,      setUpdatingId]      = useState<number | null>(null);
  const [deletingId,      setDeletingId]      = useState<number | null>(null);
  const [batchSolving,    setBatchSolving]    = useState(false);

  const { data: tickets = [], isLoading, isRefetching, refetch } = useQuery<Ticket[]>({
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
      toast({ title: lang === "ar" ? "تم تحديث حالة المشكلة" : "Ticket status updated" });
    },
    onError: () => toast({ title: lang === "ar" ? "فشل التحديث" : "Failed to update ticket", variant: "destructive" }),
    onSettled: () => setResolvingId(null),
  });

  const aiSolveMutation = useMutation({
    mutationFn: (id: number) =>
      customFetch(`/api/admin/tickets/${id}/ai-solve`, { method: "POST" }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["admin-tickets"] });
      toast({
        title: lang === "ar" ? "تم توليد حل المشكلة بالذكاء الاصطناعي" : "AI response generated",
        description: data?.model ? (lang === "ar" ? `تم الحل بواسطة نموذج ${data.model}` : `Answered by ${data.model}`) : undefined,
      });
    },
    onError: (err: any) =>
      toast({
        title: lang === "ar" ? "فشل توليد الحل بالذكاء الاصطناعي" : "AI solve failed",
        description: err?.message ?? (lang === "ar" ? "تأكد من إعداد مفتاح ومزود الذكاء الاصطناعي في الأعلى" : "Check Support AI configuration"),
        variant: "destructive",
      }),
    onSettled: () => setAiSolvingId(null),
  });

  const batchSolveMutation = useMutation({
    mutationFn: () =>
      customFetch<{ ok: boolean; solvedCount: number; totalRequested?: number }>(
        "/api/admin/tickets/ai-solve-batch",
        { method: "POST", body: JSON.stringify({}) }
      ),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin-tickets"] });
      toast({
        title: lang === "ar" ? "اكتمل الحل الجماعي بالذكاء الاصطناعي" : "Batch AI solving completed",
        description: lang === "ar"
          ? `تم حل ${data.solvedCount} من أصل ${data.totalRequested ?? data.solvedCount} مشكلة مفتوحة بنجاح.`
          : `Successfully solved ${data.solvedCount} open problem(s).`,
      });
    },
    onError: (err: any) =>
      toast({
        title: lang === "ar" ? "فشل الحل الجماعي" : "Batch solve failed",
        description: err?.message,
        variant: "destructive",
      }),
    onSettled: () => setBatchSolving(false),
  });

  const adminNoteMutation = useMutation({
    mutationFn: ({ id, adminNote }: { id: number; adminNote: string }) =>
      customFetch(`/api/admin/tickets/${id}/admin-note`, {
        method: "PUT",
        body: JSON.stringify({ adminNote }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-tickets"] });
      toast({
        title: lang === "ar" ? "تم حفظ الحل اليدوي" : "Solution saved",
        description: lang === "ar" ? "تم تمييز المشكلة كمحلولة." : "Ticket marked as resolved.",
      });
    },
    onError: () => toast({ title: lang === "ar" ? "فشل حفظ الحل" : "Failed to save solution", variant: "destructive" }),
    onSettled: () => setAdminSolvingId(null),
  });

  const updateSolutionMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: { aiResponse?: string; adminNote?: string } }) =>
      customFetch(`/api/admin/tickets/${id}/solution`, {
        method: "PUT",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-tickets"] });
      toast({ title: lang === "ar" ? "تم حفظ التعديلات بنجاح" : "Solution updated successfully" });
    },
    onError: () => toast({ title: lang === "ar" ? "فشل تحديث الرد" : "Failed to update solution", variant: "destructive" }),
    onSettled: () => setUpdatingId(null),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      customFetch(`/api/admin/tickets/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-tickets"] });
      toast({ title: lang === "ar" ? "تم حذف المشكلة نهائياً" : "Ticket deleted" });
    },
    onError: () => toast({ title: lang === "ar" ? "فشل حذف المشكلة" : "Failed to delete ticket", variant: "destructive" }),
    onSettled: () => setDeletingId(null),
  });

  // Calculate metrics
  const totalCount    = tickets.length;
  const openCount     = tickets.filter((t) => t.status === "open").length;
  const resolvedCount = tickets.filter((t) => t.status === "resolved").length;
  const aiSolvedCount = tickets.filter((t) => Boolean(t.aiResponse)).length;
  const manualCount   = tickets.filter((t) => Boolean(t.adminNote) && !t.aiResponse).length;
  const aiPercent     = resolvedCount > 0 ? Math.round((aiSolvedCount / resolvedCount) * 100) : 0;

  // Unique clients list for dropdown filter
  const clientOptions = useMemo(() => {
    const map = new Map<number, string>();
    for (const t of tickets) {
      if (t.clientId && t.clientName) {
        map.set(t.clientId, t.clientName);
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [tickets]);

  // Filtered and sorted tickets
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const result = tickets.filter((t) => {
      // Status filter
      if (filter === "open" && t.status !== "open") return false;
      if (filter === "resolved" && t.status !== "resolved") return false;
      if (filter === "ai_solved" && !t.aiResponse) return false;
      if (filter === "manual_solved" && (!t.adminNote || t.aiResponse)) return false;

      // Client filter
      if (clientFilter !== "all" && String(t.clientId) !== clientFilter) return false;

      // Search query
      if (!q) return true;
      return (
        String(t.id).includes(q) ||
        t.title.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.clientName.toLowerCase().includes(q) ||
        t.clientUsername.toLowerCase().includes(q) ||
        (t.aiResponse && t.aiResponse.toLowerCase().includes(q)) ||
        (t.adminNote && t.adminNote.toLowerCase().includes(q))
      );
    });

    // Sorting
    return result.sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      return sortOrder === "newest" ? timeB - timeA : timeA - timeB;
    });
  }, [tickets, filter, clientFilter, sortOrder, search]);

  const FILTERS: { key: Filter; label: string; count: number }[] = [
    { key: "all",           label: lang === "ar" ? "الكل" : "All",                       count: totalCount },
    { key: "open",          label: lang === "ar" ? "قيد الانتظار" : "Open",               count: openCount },
    { key: "resolved",      label: lang === "ar" ? "محلولة" : "Resolved",                 count: resolvedCount },
    { key: "ai_solved",     label: lang === "ar" ? "حلول AI" : "AI Solved",              count: aiSolvedCount },
    { key: "manual_solved", label: lang === "ar" ? "حلول يدوية" : "Manual",              count: manualCount },
  ];

  return (
    <div className="space-y-6">

      {/* ── Hero Operations Banner matching Bot Manager Login aesthetic ── */}
      <div
        className="relative overflow-hidden rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-blue-600/15 border border-white/10"
        style={{
          background: "linear-gradient(135deg, #1e40af 0%, #2563eb 50%, #1d4ed8 100%)",
        }}
      >
        <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-white/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute right-40 -top-10 w-48 h-48 bg-blue-300/20 rounded-full blur-xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          <div className="flex items-center gap-4 sm:gap-5">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white/15 backdrop-blur-md border border-white/25 shadow-[inset_0_0_0_2px_rgba(255,255,255,0.18)] flex items-center justify-center shrink-0">
              <i className="fa-solid fa-headset text-2xl sm:text-3xl text-white"></i>
            </div>
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-[11px] font-semibold text-blue-100 mb-1.5 border border-white/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {lang === "ar" ? "مركز معالجة مشاكل العملاء" : "Customer Support Operations"}
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white leading-tight">
                {lang === "ar" ? "مشاكل العملاء والدعم الفني" : "Customer Problems & Tickets"}
              </h1>
              <p className="text-xs sm:text-sm text-blue-100/90 mt-1 max-w-xl leading-relaxed">
                {lang === "ar"
                  ? "متابعة وإدارة تذاكر الدعم وحلها تلقائياً بالذكاء الاصطناعي أو التدخل اليدوي الفوري."
                  : "Review and resolve customer issues automatically with AI or manually."}
              </p>
            </div>
          </div>

          {/* Top actions */}
          <div className="flex items-center gap-2 flex-wrap self-start lg:self-auto shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isRefetching}
              className="gap-1.5 text-xs h-9 bg-white/15 hover:bg-white/25 text-white border-white/20 rounded-xl cursor-pointer"
              title={lang === "ar" ? "تحديث القائمة" : "Refresh list"}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefetching ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">{lang === "ar" ? "تحديث" : "Refresh"}</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => exportTicketsToCsv(filtered, lang)}
              disabled={filtered.length === 0}
              className="gap-1.5 text-xs h-9 bg-white/15 hover:bg-white/25 text-white border-white/20 rounded-xl cursor-pointer"
              title={lang === "ar" ? "تصدير المشاكل المعروضة كملف CSV" : "Export current list to CSV"}
            >
              <Download className="w-3.5 h-3.5 text-emerald-300" />
              <span>{lang === "ar" ? "تصدير CSV" : "Export CSV"}</span>
            </Button>

            {openCount > 0 && (
              <Button
                size="sm"
                onClick={() => {
                  setBatchSolving(true);
                  batchSolveMutation.mutate();
                }}
                disabled={batchSolving}
                className="gap-1.5 text-xs h-9 bg-white hover:bg-blue-50 text-blue-700 font-bold shadow-lg shadow-black/10 rounded-xl px-4 cursor-pointer"
                title={lang === "ar" ? "حل جميع المشاكل المفتوحة آلياً بالذكاء الاصطناعي" : "Auto-resolve all open tickets using AI"}
              >
                {batchSolving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                )}
                <span>
                  {batchSolving
                    ? (lang === "ar" ? "جارٍ الحل الجماعي..." : "Solving All...")
                    : (lang === "ar" ? `حل الكل بالذكاء الاصطناعي (${openCount})` : `Solve All with AI (${openCount})`)}
                </span>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── KPI Metric Cards (Transparent White Frosted Glass with Left Border #2D5BE3) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        {/* Total problems */}
        <Card
          onClick={() => setFilter("all")}
          className={`cursor-pointer rounded-2xl transition-all backdrop-blur-md relative overflow-hidden border-l-4 border-l-[#2D5BE3] ${
            filter === "all"
              ? "ring-2 ring-blue-600/60 border-blue-500/60 bg-white/95 dark:bg-white/20 shadow-md scale-[1.02]"
              : "bg-white/75 dark:bg-white/[0.07] border border-white/60 dark:border-white/15 hover:border-blue-400/50 hover:bg-white/90 dark:hover:bg-white/10 shadow-sm hover:shadow-md hover:-translate-y-0.5"
          }`}
          title={lang === "ar" ? "تصفية: عرض الكل" : "Filter: View all"}
        >
          <CardContent className="p-4 pt-3.5 relative flex flex-col items-center justify-center text-center min-h-[112px]">
            <div className="absolute top-2.5 right-2.5 p-1.5 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/20 shadow-inner">
              <LifeBuoy className="w-4 h-4" />
            </div>

            <p className="text-xs font-bold text-slate-700 dark:text-slate-300 px-6 truncate max-w-full">
              {lang === "ar" ? "إجمالي المشاكل" : "Total Problems"}
            </p>
            {isLoading ? (
              <Skeleton className="h-7 w-14 mt-1.5 rounded-lg" />
            ) : (
              <h3 className="text-2xl sm:text-3xl font-black mt-1 text-foreground tracking-tight tabular-nums">{totalCount}</h3>
            )}
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-medium truncate max-w-full">
              {lang === "ar" ? "كافة التذاكر المسجلة" : "All logged tickets"}
            </p>
          </CardContent>
        </Card>

        {/* Open tickets */}
        <Card
          onClick={() => setFilter("open")}
          className={`cursor-pointer rounded-2xl transition-all backdrop-blur-md relative overflow-hidden border-l-4 border-l-[#2D5BE3] ${
            filter === "open"
              ? "ring-2 ring-amber-500/60 border-amber-500/60 bg-amber-50/90 dark:bg-amber-500/20 shadow-md scale-[1.02]"
              : openCount > 0
              ? "bg-amber-50/60 dark:bg-amber-500/10 border border-amber-400/40 hover:border-amber-500/60 hover:bg-amber-50/80 shadow-sm hover:shadow-md hover:-translate-y-0.5"
              : "bg-white/75 dark:bg-white/[0.07] border border-white/60 dark:border-white/15 hover:border-amber-400/50 hover:bg-white/90 dark:hover:bg-white/10 shadow-sm hover:shadow-md hover:-translate-y-0.5"
          }`}
          title={lang === "ar" ? "تصفية: المشاكل قيد الانتظار" : "Filter: Open issues"}
        >
          <CardContent className="p-4 pt-3.5 relative flex flex-col items-center justify-center text-center min-h-[112px]">
            <div className={`absolute top-2.5 right-2.5 p-1.5 rounded-xl border ${
              openCount > 0
                ? "bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30 shadow-inner"
                : "bg-white/50 dark:bg-white/10 text-slate-400 border-white/20"
            }`}>
              <AlertCircle className="w-4 h-4" />
              {openCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                </span>
              )}
            </div>

            <p className="text-xs font-bold text-slate-700 dark:text-slate-300 px-6 truncate max-w-full">
              {lang === "ar" ? "قيد الانتظار" : "Open Issues"}
            </p>
            {isLoading ? (
              <Skeleton className="h-7 w-14 mt-1.5 rounded-lg" />
            ) : (
              <h3 className={`text-2xl sm:text-3xl font-black mt-1 tracking-tight tabular-nums ${openCount > 0 ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`}>
                {openCount}
              </h3>
            )}
            <p className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold mt-0.5 truncate max-w-full">
              {lang === "ar" ? "تحتاج إلى حل" : "Requires attention"}
            </p>
          </CardContent>
        </Card>

        {/* Resolved tickets */}
        <Card
          onClick={() => setFilter("resolved")}
          className={`cursor-pointer rounded-2xl transition-all backdrop-blur-md relative overflow-hidden border-l-4 border-l-[#2D5BE3] ${
            filter === "resolved"
              ? "ring-2 ring-emerald-500/60 border-emerald-500/60 bg-emerald-50/90 dark:bg-emerald-500/20 shadow-md scale-[1.02]"
              : "bg-white/75 dark:bg-white/[0.07] border border-white/60 dark:border-white/15 hover:border-emerald-400/50 hover:bg-white/90 dark:hover:bg-white/10 shadow-sm hover:shadow-md hover:-translate-y-0.5"
          }`}
          title={lang === "ar" ? "تصفية: المشاكل المحلولة" : "Filter: Resolved"}
        >
          <CardContent className="p-4 pt-3.5 relative flex flex-col items-center justify-center text-center min-h-[112px]">
            <div className="absolute top-2.5 right-2.5 p-1.5 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shadow-inner">
              <CheckCircle2 className="w-4 h-4" />
            </div>

            <p className="text-xs font-bold text-slate-700 dark:text-slate-300 px-6 truncate max-w-full">
              {lang === "ar" ? "تم الحل بنجاح" : "Resolved"}
            </p>
            {isLoading ? (
              <Skeleton className="h-7 w-14 mt-1.5 rounded-lg" />
            ) : (
              <h3 className="text-2xl sm:text-3xl font-black mt-1 text-emerald-600 dark:text-emerald-400 tracking-tight tabular-nums">{resolvedCount}</h3>
            )}
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mt-0.5 truncate max-w-full">
              {lang === "ar" ? "مكتملة ومغلقة" : "Successfully closed"}
            </p>
          </CardContent>
        </Card>

        {/* AI Solved tickets */}
        <Card
          onClick={() => setFilter("ai_solved")}
          className={`cursor-pointer rounded-2xl transition-all backdrop-blur-md relative overflow-hidden border-l-4 border-l-[#2D5BE3] ${
            filter === "ai_solved"
              ? "ring-2 ring-violet-500/60 border-violet-500/60 bg-violet-50/90 dark:bg-violet-500/20 shadow-md scale-[1.02]"
              : "bg-white/75 dark:bg-white/[0.07] border border-white/60 dark:border-white/15 hover:border-violet-400/50 hover:bg-white/90 dark:hover:bg-white/10 shadow-sm hover:shadow-md hover:-translate-y-0.5"
          }`}
          title={lang === "ar" ? "تصفية: حلول الذكاء الاصطناعي" : "Filter: AI solved"}
        >
          <CardContent className="p-4 pt-3.5 relative flex flex-col items-center justify-center text-center min-h-[112px]">
            <div className="absolute top-2.5 right-2.5 p-1.5 rounded-xl bg-violet-500/15 text-violet-600 dark:text-violet-400 border border-violet-500/20 shadow-inner">
              <Bot className="w-4 h-4" />
            </div>

            <p className="text-xs font-bold text-slate-700 dark:text-slate-300 px-6 truncate max-w-full">
              {lang === "ar" ? "حلول الـ AI" : "AI Solved"}
            </p>
            {isLoading ? (
              <Skeleton className="h-7 w-14 mt-1.5 rounded-lg" />
            ) : (
              <h3 className="text-2xl sm:text-3xl font-black mt-1 text-violet-600 dark:text-violet-400 tracking-tight tabular-nums">{aiSolvedCount}</h3>
            )}
            <p className="text-[11px] text-violet-600 dark:text-violet-400 font-medium mt-0.5 truncate max-w-full">
              {lang === "ar" ? "حُلت تلقائياً بالذكاء" : "Automated resolution"}
            </p>
          </CardContent>
        </Card>

        {/* Manual Solved tickets */}
        <Card
          onClick={() => setFilter("manual_solved")}
          className={`cursor-pointer rounded-2xl transition-all backdrop-blur-md relative overflow-hidden border-l-4 border-l-[#2D5BE3] ${
            filter === "manual_solved"
              ? "ring-2 ring-sky-500/60 border-sky-500/60 bg-sky-50/90 dark:bg-sky-500/20 shadow-md scale-[1.02]"
              : "bg-white/75 dark:bg-white/[0.07] border border-white/60 dark:border-white/15 hover:border-sky-400/50 hover:bg-white/90 dark:hover:bg-white/10 shadow-sm hover:shadow-md hover:-translate-y-0.5"
          }`}
          title={lang === "ar" ? "تصفية: حلول يدوية" : "Filter: Manual solved"}
        >
          <CardContent className="p-4 pt-3.5 relative flex flex-col items-center justify-center text-center min-h-[112px]">
            <div className="absolute top-2.5 right-2.5 p-1.5 rounded-xl bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/20 shadow-inner">
              <UserCheck className="w-4 h-4" />
            </div>

            <p className="text-xs font-bold text-slate-700 dark:text-slate-300 px-6 truncate max-w-full">
              {lang === "ar" ? "حلول يدوية" : "Manual Solved"}
            </p>
            {isLoading ? (
              <Skeleton className="h-7 w-14 mt-1.5 rounded-lg" />
            ) : (
              <h3 className="text-2xl sm:text-3xl font-black mt-1 text-sky-600 dark:text-sky-400 tracking-tight tabular-nums">{manualCount}</h3>
            )}
            <p className="text-[11px] text-sky-600 dark:text-sky-400 font-medium mt-0.5 truncate max-w-full">
              {lang === "ar" ? "بواسطة فريق الدعم" : "By support team"}
            </p>
          </CardContent>
        </Card>

        {/* AI Resolution Rate */}
        <Card className="rounded-2xl transition-all backdrop-blur-md relative overflow-hidden bg-white/75 dark:bg-white/[0.07] border border-white/60 dark:border-white/15 shadow-sm hover:shadow-md hover:-translate-y-0.5 border-l-4 border-l-[#2D5BE3]">
          <CardContent className="p-4 pt-3.5 relative flex flex-col items-center justify-center text-center min-h-[112px]">
            <div className="absolute top-2.5 right-2.5 p-1.5 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 shadow-inner">
              <TrendingUp className="w-4 h-4" />
            </div>

            <p className="text-xs font-bold text-slate-700 dark:text-slate-300 px-6 truncate max-w-full">
              {lang === "ar" ? "نسبة نجاح الـ AI" : "AI Success Rate"}
            </p>
            {isLoading ? (
              <Skeleton className="h-7 w-14 mt-1.5 rounded-lg" />
            ) : (
              <h3 className="text-2xl sm:text-3xl font-black mt-1 text-indigo-600 dark:text-indigo-400 tracking-tight tabular-nums">{aiPercent}%</h3>
            )}
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-medium truncate max-w-full">
              {lang === "ar" ? `${aiSolvedCount} من ${resolvedCount || totalCount} محلولة` : `${aiSolvedCount} of ${resolvedCount || totalCount} solved`}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Support AI Agent Configuration Card ── */}
      <SupportAICard />

      {/* ── Search, Filters & Sorting Bar ── */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
          {/* Search box */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder={lang === "ar" ? "بحث برقم التذكرة، العميل، العنوان، أو تفاصيل المشكلة..." : "Search by ticket ID, client, title, or description…"}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-8 bg-card"
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

          {/* Client Filter Dropdown */}
          {clientOptions.length > 1 && (
            <select
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              className="h-10 px-3 py-1 rounded-md border border-border bg-card text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary shrink-0 min-w-[150px]"
            >
              <option value="all">{lang === "ar" ? "جميع العملاء" : "All Clients"}</option>
              {clientOptions.map((c) => (
                <option key={c.id} value={String(c.id)}>{c.name}</option>
              ))}
            </select>
          )}

          {/* Sort Order Dropdown */}
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as SortOrder)}
            className="h-10 px-3 py-1 rounded-md border border-border bg-card text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary shrink-0"
          >
            <option value="newest">{lang === "ar" ? "الأحدث أولاً" : "Newest first"}</option>
            <option value="oldest">{lang === "ar" ? "الأقدم أولاً" : "Oldest first"}</option>
          </select>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                filter === f.key
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <span>{f.label}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                filter === f.key ? "bg-white/20 text-white" : "bg-muted-foreground/20 text-muted-foreground"
              }`}>
                {f.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Active filters notice */}
      {(search.trim() || clientFilter !== "all" || filter !== "all") && (
        <div className="flex items-center justify-between text-xs text-muted-foreground bg-muted/20 px-3 py-1.5 rounded-lg border border-border/40">
          <span>
            {filtered.length === 0
              ? (lang === "ar" ? "لا توجد نتائج مطابقة لخيارات البحث الحالية." : "No matching tickets found.")
              : (lang === "ar" ? `تم العثور على ${filtered.length} مشكلة` : `Showing ${filtered.length} ticket(s)`)}
          </span>
          <button
            onClick={() => { setSearch(""); setClientFilter("all"); setFilter("all"); }}
            className="text-primary hover:underline font-medium text-[11px]"
          >
            {lang === "ar" ? "إعادة تعيين الفلاتر" : "Reset filters"}
          </button>
        </div>
      )}

      {/* ── Ticket List ── */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground text-sm">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <p>{lang === "ar" ? "جاري تحميل سجلات المشاكل..." : "Loading customer problems…"}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground bg-card border border-border rounded-xl p-6 text-center">
          <CheckCircle2 className="w-10 h-10 text-emerald-500/40" />
          <div>
            <p className="text-sm font-semibold text-foreground">
              {lang === "ar" ? "لا توجد مشاكل معروضة حالياً" : "No customer problems found"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {lang === "ar" ? "جميع بلاغات العملاء تمت معالجتها أو لا توجد نتائج مطابقة." : "All customer issues are resolved or no tickets match your search."}
            </p>
          </div>
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
              updatingSolution={updatingId === ticket.id && updateSolutionMutation.isPending}
              deleting={deletingId === ticket.id && deleteMutation.isPending}
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
              onUpdateSolution={(id, payload) => {
                setUpdatingId(id);
                updateSolutionMutation.mutate({ id, payload });
              }}
              onDelete={(id) => {
                setDeletingId(id);
                deleteMutation.mutate(id);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
