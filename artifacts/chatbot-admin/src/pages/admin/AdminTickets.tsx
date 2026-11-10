import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch, getListCompaniesQueryKey } from "@workspace/api-client-react";
import {
  AlertCircle, CheckCircle2, Clock, Bot, ChevronDown, ChevronUp,
  Sparkles, Loader2, User, Calendar, Search, X, PenLine, RotateCcw,
  Trash2, Copy, Check, Download, RefreshCw, Edit3, ShieldAlert,
  UserCheck, TrendingUp, LifeBuoy, Package, Zap,
} from "lucide-react";
import SupportAICard from "@/components/SupportAICard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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

interface PackageItem {
  id: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  monthlyPriceUsd: number;
  tokensMonthly: number;
  tokensFormatted?: string;
  popular?: boolean;
  color?: string;
  badgeAr?: string;
  badgeEn?: string;
  featuresAr: string[];
  featuresEn: string[];
  allowedPages?: string[];
  retentionDays?: number | null;
  channels?: string[];
  tools?: string[];
  dataSources?: string[];
  isActive?: boolean;
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
  onApprovePlan,
  resolving,
  aiSolving,
  adminSolving,
  updatingSolution,
  deleting,
  isApprovingThisTicket,
}: {
  ticket: Ticket;
  onResolve:        (id: number, status: "open" | "resolved") => void;
  onAiSolve:        (id: number) => void;
  onAdminNote:      (id: number, note: string) => void;
  onUpdateSolution: (id: number, payload: { aiResponse?: string; adminNote?: string }) => void;
  onDelete:         (id: number) => void;
  onApprovePlan?:   (ticket: Ticket) => void;
  resolving:        boolean;
  aiSolving:        boolean;
  adminSolving:     boolean;
  updatingSolution: boolean;
  deleting:         boolean;
  isApprovingThisTicket?: boolean;
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

  const isTopup = useMemo(() => {
    const tL = (ticket.title || "").toLowerCase();
    const dL = (ticket.description || "").toLowerCase();
    return (
      tL.includes("شحن") ||
      tL.includes("topup") ||
      tL.includes("حزمة") ||
      dL.includes("طلب شحن") ||
      dL.includes("رصيد إضافي") ||
      dL.includes("حزمة شحن")
    );
  }, [ticket.title, ticket.description]);

  const isPlanRequest = useMemo(() => {
    const tL = (ticket.title || "").toLowerCase();
    const dL = (ticket.description || "").toLowerCase();
    return (
      tL.includes("باقة") ||
      tL.includes("plan") ||
      tL.includes("شحن") ||
      tL.includes("topup") ||
      tL.includes("اشتراك") ||
      dL.includes("معرف الباقة") ||
      dL.includes("طلب شحن") ||
      dL.includes("طلب اشتراك") ||
      dL.includes("طلب تغيير باقة")
    );
  }, [ticket.title, ticket.description]);

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
    <div className={`bg-card border rounded-xl overflow-hidden transition-all shadow-md shadow-[#2D5BE3]/15 border-l-4 border-l-[#2D5BE3] ${
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
              {isTopup && (
                <Badge
                  variant="outline"
                  className="text-[10px] shrink-0 font-semibold text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/10"
                >
                  {lang === "ar" ? "شحن رصيد إضافي ⚡" : "Extra Top-Up ⚡"}
                </Badge>
              )}
              {ticket.adminNote?.includes("تم إلغاء هذا الطلب") || ticket.adminNote?.includes("Auto-cancelled") ? (
                <Badge
                  variant="outline"
                  className="text-[10px] shrink-0 font-semibold text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/10"
                >
                  {lang === "ar" ? "ملغي تلقائياً (طلب أحدث)" : "Cancelled (Superseded)"}
                </Badge>
              ) : (
                <Badge
                  variant={isOpen ? "destructive" : "secondary"}
                  className="text-[10px] shrink-0 font-medium"
                >
                  {isOpen ? (lang === "ar" ? "قيد الانتظار" : "Open") : (lang === "ar" ? "تم الحل" : "Resolved")}
                </Badge>
              )}
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
          {isOpen && isPlanRequest && (
            <Button
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onApprovePlan?.(ticket);
              }}
              disabled={isApprovingThisTicket || aiSolving || adminSolving}
              title={lang === "ar" ? "اعتماد الباقة وتفعيلها وإرسال الفاتورة للعميل" : "Approve & activate plan, send invoice"}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 text-xs h-8 px-3 shadow-sm font-semibold cursor-pointer"
            >
              {isApprovingThisTicket ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              <span>
                {lang === "ar"
                  ? isTopup
                    ? "اعتماد وشحن الرصيد ⚡"
                    : "اعتماد وتفعيل الباقة 🧾"
                  : isTopup
                  ? "Approve & Top-up ⚡"
                  : "Approve & Activate 🧾"}
              </span>
            </Button>
          )}

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
  const [isRefreshing,    setIsRefreshing]    = useState(false);
  const [approvalTicket,  setApprovalTicket]  = useState<Ticket | null>(null);
  const [approvalIsPaid,  setApprovalIsPaid]  = useState<boolean>(true);
  const [isApprovingPlan, setIsApprovingPlan] = useState<boolean>(false);
  const [approvalSelectedPlanId, setApprovalSelectedPlanId] = useState<string | null>(null);
  const [approvalRetentionDays, setApprovalRetentionDays] = useState<number | null | undefined>(undefined);
  const [approvalEndDateMode, setApprovalEndDateMode] = useState<"auto" | "custom">("auto");
  const [approvalCustomEndDate, setApprovalCustomEndDate] = useState<string>("");

  const { data: packagesCatalog } = useQuery<{ packages: PackageItem[]; topupPacks: any[] }>({
    queryKey: ["admin-packages"],
    queryFn: () => customFetch("/api/admin/packages"),
    staleTime: 30_000,
  });

  const { data: companies = [] } = useQuery<any[]>({
    queryKey: ["admin-companies"],
    queryFn: () => customFetch("/api/admin/companies"),
    staleTime: 30_000,
  });

  const isApprovalTicketTopup = useMemo(() => {
    if (!approvalTicket) return false;
    const tL = (approvalTicket.title || "").toLowerCase();
    const dL = (approvalTicket.description || "").toLowerCase();
    return (
      tL.includes("شحن") ||
      tL.includes("topup") ||
      tL.includes("حزمة") ||
      dL.includes("طلب شحن") ||
      dL.includes("رصيد إضافي") ||
      dL.includes("حزمة شحن")
    );
  }, [approvalTicket]);

  const targetCompany = useMemo(() => {
    if (!approvalTicket || !companies.length) return null;
    return (
      companies.find(
        (c: any) =>
          c.clientId === approvalTicket.clientId ||
          (c.name && approvalTicket.description && approvalTicket.description.toLowerCase().includes(c.name.toLowerCase()))
      ) || null
    );
  }, [approvalTicket, companies]);

  const targetCompanySubEndDate = useMemo(() => {
    if (!targetCompany) return null;
    const raw = targetCompany.activationEnd || targetCompany.quotaEndDate;
    if (!raw) return null;
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  }, [targetCompany]);

  const parsedTopupInfo = useMemo(() => {
    if (!approvalTicket || !isApprovalTicketTopup) return null;
    const desc = approvalTicket.description || "";
    const title = approvalTicket.title || "";
    const descLower = desc.toLowerCase();
    const titleLower = title.toLowerCase();

    let tokens = 50_000;
    const tokenMatch =
      desc.match(/(\d+[\d,]*)\s*tokens?/i) ||
      title.match(/(\d+[\d,]*)\s*رموز/i) ||
      desc.match(/(\d+[\d,]*)\s*رموز/i);
    const kMatch = titleLower.match(/(\d+)\s*k\b/) || descLower.match(/(\d+)\s*k\b/);
    const mMatch = titleLower.match(/(\d+)\s*m\b/) || descLower.match(/(\d+)\s*m\b/);

    if (tokenMatch && tokenMatch[1]) {
      tokens = parseInt(tokenMatch[1].replace(/,/g, ""), 10);
    } else if (kMatch && kMatch[1]) {
      tokens = parseInt(kMatch[1], 10) * 1000;
    } else if (mMatch && mMatch[1]) {
      tokens = parseInt(mMatch[1], 10) * 1_000_000;
    } else if (titleLower.includes("25k") || descLower.includes("25k")) {
      tokens = 25_000;
    } else if (titleLower.includes("50k") || descLower.includes("50k")) {
      tokens = 50_000;
    } else if (titleLower.includes("100k") || descLower.includes("100k")) {
      tokens = 100_000;
    } else if (titleLower.includes("250k") || descLower.includes("250k")) {
      tokens = 250_000;
    } else if (titleLower.includes("500k") || descLower.includes("500k")) {
      tokens = 500_000;
    } else if (titleLower.includes("1m") || descLower.includes("1m")) {
      tokens = 1_000_000;
    }

    const topups = packagesCatalog?.topupPacks || [];
    const matched = topups.find((p: any) => p.tokens === tokens);
    let rawFormatted = matched?.formatted || (tokens >= 1_000_000 ? (tokens === 1_000_000 ? "1m" : `${tokens / 1_000_000}m`) : `${tokens / 1000}K+`);
    if (rawFormatted === "+1000K" || rawFormatted === "1000K" || rawFormatted?.toLowerCase() === "+1000k" || rawFormatted?.toLowerCase() === "1000k" || tokens === 1_000_000) {
      rawFormatted = "1m";
    }
    const formatted = rawFormatted;
    const priceUsd = matched?.priceUsd || Math.max(5, Math.round((tokens / 25000) * 5));

    return { tokens, formatted, priceUsd };
  }, [approvalTicket, isApprovalTicketTopup, packagesCatalog]);

  const handleOpenApproveModal = (ticket: Ticket) => {
    setApprovalTicket(ticket);
    setApprovalIsPaid(true);
    setApprovalEndDateMode("auto");
    setApprovalCustomEndDate("");

    const desc = ticket.description || "";
    const title = ticket.title || "";
    const descLower = desc.toLowerCase();
    const titleLower = title.toLowerCase();

    const packages = packagesCatalog?.packages || [];

    // 1. Explicit bracketed tag like [معرف الباقة: pro]
    let detectedPlanId = "";
    const planIdMatch = desc.match(/(?:\[معرف الباقة|معرف الباقة|معرف الخطة|plan_id|planId)[:\s]+([a-zA-Z0-9_-]+)/i);
    if (planIdMatch && planIdMatch[1]) {
      detectedPlanId = planIdMatch[1].trim().toLowerCase();
    }

    // 2. Target plan in change/upgrade requests: "من ... إلى [الباقة الجديدة]"
    if (!detectedPlanId) {
      const toMatch = desc.match(/(?:إلى|to)\s*\[?([^\]\n\r]+)\]?/i) || title.match(/(?:إلى|to)\s*\[?([^\]\n\r]+)\]?/i);
      if (toMatch && toMatch[1]) {
        const targetText = toMatch[1].toLowerCase();
        for (const p of packages) {
          if (
            targetText.includes(p.id) ||
            targetText.includes(p.nameAr.toLowerCase()) ||
            targetText.includes(p.nameEn.toLowerCase())
          ) {
            detectedPlanId = p.id;
            break;
          }
        }
      }
    }

    // 3. Match by token count in description (e.g. 1,000,000 => pro, 500,000 => starter, 25,000 => free_trial)
    if (!detectedPlanId) {
      const tokenMatch =
        desc.match(/(?:رصيد الرموز المرفق|رموز|tokens?)[:\s]+(\d+[\d,]*)/i) ||
        desc.match(/(\d+[\d,]*)\s*tokens?/i);
      if (tokenMatch && tokenMatch[1]) {
        const parsedTokens = parseInt(tokenMatch[1].replace(/,/g, ""), 10);
        const match = packages.find((p) => p.tokensMonthly === parsedTokens);
        if (match) detectedPlanId = match.id;
      }
    }

    // 4. Fallback search in title and description excluding previous plan
    if (!detectedPlanId) {
      const cleanedDesc = desc.replace(/\[الباقة السابقة:[^\]]+\]/gi, "").replace(/من\s+\[?[^\]\n\r]+\]?\s+إلى/gi, "");
      const cleanedTitle = title.replace(/من\s+\[?[^\]\n\r]+\]?\s+إلى/gi, "");
      const cleanedDescLower = cleanedDesc.toLowerCase();
      const cleanedTitleLower = cleanedTitle.toLowerCase();

      for (const p of packages) {
        if (
          cleanedDescLower.includes(p.id) ||
          cleanedTitleLower.includes(p.id) ||
          cleanedDesc.includes(p.nameAr) ||
          cleanedTitle.includes(p.nameAr) ||
          cleanedDescLower.includes(p.nameEn.toLowerCase()) ||
          cleanedTitleLower.includes(p.nameEn.toLowerCase())
        ) {
          detectedPlanId = p.id;
          break;
        }
      }
    }

    const matchedPlan = packages.find((p) => p.id === detectedPlanId) || packages[1] || packages[0];
    setApprovalSelectedPlanId(matchedPlan?.id || "pro");

    // Extract retention days
    let detectedRetention: number | null | undefined = undefined;
    if (desc.includes("دائم") || desc.includes("permanent") || desc.includes("بدون حذف")) {
      detectedRetention = null;
    } else {
      const retMatch = desc.match(/(?:سياسة الحذف التلقائي|الاحتفاظ بالسجلات|سياسة الحذف|الحذف التلقائي|retention)[^:\d\n\r]*[:\s]+(\d+)/i);
      if (retMatch && retMatch[1]) {
        detectedRetention = parseInt(retMatch[1], 10);
      } else {
        detectedRetention = matchedPlan?.retentionDays ?? (matchedPlan?.id === "pro" ? 7 : (matchedPlan?.id === "starter" ? 3 : 14));
      }
    }
    setApprovalRetentionDays(detectedRetention);
  };

  const activeModalPlan = useMemo(() => {
    const pkgs = packagesCatalog?.packages || [];
    return pkgs.find((p) => p.id === approvalSelectedPlanId) || pkgs[1] || pkgs[0];
  }, [packagesCatalog, approvalSelectedPlanId]);

  const handleConfirmApproval = async (isPaid: boolean) => {
    if (!approvalTicket) return;
    try {
      setIsApprovingPlan(true);
      const effectiveEndDate =
        approvalEndDateMode === "custom" && approvalCustomEndDate.trim()
          ? new Date(`${approvalCustomEndDate.trim()}T23:59:59.999Z`).toISOString()
          : undefined;

      const res: any = await customFetch(`/api/admin/plan-requests/${approvalTicket.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isPaid,
          planId: approvalSelectedPlanId,
          retentionDays: approvalRetentionDays,
          overrideEndDate: effectiveEndDate,
        }),
      });
      setApprovalTicket(null);
      toast({
        title:
          lang === "ar"
            ? isPaid
              ? "✅ تم الاعتماد والتفعيل كـ [مسددة Paid] بنجاح!"
              : "⏳ تم الاعتماد والتفعيل كـ [غير مسددة Unpaid] بنجاح!"
            : isPaid
            ? "Plan Approved & Activated as Paid!"
            : "Plan Approved & Activated as Unpaid!",
        description:
          lang === "ar"
            ? `تم تفعيل الباقة وتحديث الكوتا، وإصدار الفاتورة رقم #${res?.result?.invoice?.invoiceNumber || approvalTicket.id} وحالتها (${isPaid ? "مسددة Paid" : "غير مسددة Unpaid"}) وإرسالها للعميل.`
            : `Plan activated, quota updated, and invoice #${res?.result?.invoice?.invoiceNumber || approvalTicket.id} (${isPaid ? "Paid" : "Unpaid"}) dispatched.`,
      });
      // Clear stale localStorage for this company so AdminCompanies gets fresh server data
      try {
        if (res?.result?.company?.id) {
          localStorage.removeItem(`admin_company_pages_${res.result.company.id}`);
        }
      } catch {}

      queryClient.invalidateQueries({ queryKey: ["admin-tickets"] });
      queryClient.invalidateQueries({ queryKey: ["admin-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      queryClient.invalidateQueries({ queryKey: ["admin-companies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/companies"] });
      queryClient.invalidateQueries({ queryKey: getListCompaniesQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["/api/client/company"] });
      queryClient.invalidateQueries({ queryKey: ["admin-packages"] });
      queryClient.invalidateQueries({ queryKey: ["admin-notifications"] });
      queryClient.invalidateQueries({ queryKey: ["chat-logs"] });
    } catch (err: any) {
      toast({
        title: lang === "ar" ? "خطأ في الاعتماد" : "Approval Failed",
        description: err?.message || (lang === "ar" ? "تعذر اعتماد الطلب" : "Failed to approve request"),
        variant: "destructive",
      });
    } finally {
      setIsApprovingPlan(false);
    }
  };

  const handleRefresh = async () => {
    try {
      setIsRefreshing(true);
      await Promise.all([
        queryClient.invalidateQueries(),
        refetch(),
      ]);
      toast({
        title: lang === "ar" ? "تم تحديث المشاكل والعدادات بنجاح" : "Customer problems and counters refreshed successfully",
      });
    } catch {
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
  };

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

  // Deduplicate tickets: ensure only the single latest plan switch request per client is kept
  const deduplicatedTickets = useMemo(() => {
    const sorted = [...tickets].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const seenPlanByClient = new Set<number>();
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
      if (isPlan && t.clientId) {
        if (seenPlanByClient.has(t.clientId)) {
          return false;
        }
        seenPlanByClient.add(t.clientId);
      }
      return true;
    });
  }, [tickets]);

  // Calculate metrics
  const totalCount    = deduplicatedTickets.length;
  const openCount     = deduplicatedTickets.filter((t) => t.status === "open").length;
  const resolvedCount = deduplicatedTickets.filter((t) => t.status === "resolved").length;
  const aiSolvedCount = deduplicatedTickets.filter((t) => Boolean(t.aiResponse)).length;
  const manualCount   = deduplicatedTickets.filter((t) => Boolean(t.adminNote) && !t.aiResponse).length;
  const aiPercent     = resolvedCount > 0 ? Math.round((aiSolvedCount / resolvedCount) * 100) : 0;

  // Unique clients list for dropdown filter
  const clientOptions = useMemo(() => {
    const map = new Map<number, string>();
    for (const t of deduplicatedTickets) {
      if (t.clientId && t.clientName) {
        map.set(t.clientId, t.clientName);
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [deduplicatedTickets]);

  // Filtered and sorted tickets
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const result = deduplicatedTickets.filter((t) => {
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
  }, [deduplicatedTickets, filter, clientFilter, sortOrder, search]);

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
              onClick={handleRefresh}
              disabled={isRefetching || isRefreshing}
              className="gap-1.5 text-xs h-9 bg-white/15 hover:bg-white/25 text-white border-white/20 rounded-xl cursor-pointer"
              title={lang === "ar" ? "تحديث القائمة" : "Refresh list"}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefetching || isRefreshing ? "animate-spin" : ""}`} />
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
          className={`cursor-pointer rounded-2xl transition-all backdrop-blur-md relative overflow-hidden border-l-4 border-l-[#2D5BE3] shadow-md shadow-[#2D5BE3]/15 ${
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
          className={`cursor-pointer rounded-2xl transition-all backdrop-blur-md relative overflow-hidden border-l-4 border-l-[#2D5BE3] shadow-md shadow-[#2D5BE3]/15 ${
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
          className={`cursor-pointer rounded-2xl transition-all backdrop-blur-md relative overflow-hidden border-l-4 border-l-[#2D5BE3] shadow-md shadow-[#2D5BE3]/15 ${
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
          className={`cursor-pointer rounded-2xl transition-all backdrop-blur-md relative overflow-hidden border-l-4 border-l-[#2D5BE3] shadow-md shadow-[#2D5BE3]/15 ${
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
          className={`cursor-pointer rounded-2xl transition-all backdrop-blur-md relative overflow-hidden border-l-4 border-l-[#2D5BE3] shadow-md shadow-[#2D5BE3]/15 ${
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
        <Card className="rounded-2xl transition-all backdrop-blur-md relative overflow-hidden bg-white/75 dark:bg-white/[0.07] border border-white/60 dark:border-white/15 shadow-md shadow-[#2D5BE3]/15 hover:shadow-lg hover:shadow-[#2D5BE3]/25 hover:-translate-y-0.5 border-l-4 border-l-[#2D5BE3]">
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
              onApprovePlan={handleOpenApproveModal}
              isApprovingThisTicket={isApprovingPlan && approvalTicket?.id === ticket.id}
            />
          ))}
        </div>
      )}

      {/* ── Hoisted Approve & Activate Modal (Paid vs Unpaid Selection & Direct Sync) ── */}
      <Dialog open={Boolean(approvalTicket)} onOpenChange={(open) => !open && setApprovalTicket(null)}>
        <DialogContent className="max-w-lg p-6 max-h-[90vh] overflow-y-auto" dir={lang === "ar" ? "rtl" : "ltr"}>
          <DialogHeader>
            <div className="w-12 h-12 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-2">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <DialogTitle className="text-center text-lg font-bold">
              {isApprovalTicketTopup
                ? (lang === "ar" ? "اعتماد وشحن الرصيد الإضافي وإصدار الفاتورة" : "Approve & Activate Extra Top-Up & Invoice")
                : (lang === "ar" ? "اعتماد وتفعيل الباقة وإصدار الفاتورة" : "Approve & Activate Plan & Send Invoice")}
            </DialogTitle>
            <DialogDescription className="text-center text-xs text-muted-foreground">
              {approvalTicket && (lang === "ar"
                ? `طلب #${approvalTicket.id} للعميل: ${approvalTicket.clientName} (@${approvalTicket.clientUsername})`
                : `Ticket #${approvalTicket.id} for client: ${approvalTicket.clientName} (@${approvalTicket.clientUsername})`)}
            </DialogDescription>
          </DialogHeader>

          {approvalTicket && (
            <div className="space-y-3.5 my-2">
              {/* Direct Sync Banner with One-Click Plan Tier Switcher */}
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/25 text-blue-700 dark:text-blue-300 text-xs">
                <Zap className="w-4 h-4 text-blue-600 shrink-0" />
                <span className="font-semibold text-[11px]">
                  {isApprovalTicketTopup
                    ? (lang === "ar"
                        ? "⚡ يتطابق تاريخ انتهاء صلاحية هذا الرصيد الإضافي تلقائياً مع موعد نهاية الاشتراك الحالي."
                        : "⚡ This extra allowance end date automatically synchronizes with active subscription expiration.")
                    : (lang === "ar"
                        ? "⚡ متزامن بالكامل مع «اعتماد وتبديل باقة الشركة بنقرة واحدة» (One-Click Plan Tier Switcher)"
                        : "⚡ 100% Direct Sync with «One-Click Plan Tier Switcher» (Quota, Retention, Channels, Tools)")}
                </span>
              </div>

              {/* Matched Plan or Top-Up Tier Card */}
              {isApprovalTicketTopup && parsedTopupInfo ? (
                <div className="p-3.5 rounded-xl border border-amber-500/30 bg-card shadow-sm space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-amber-500" />
                        <h5 className="text-xs font-bold text-foreground">
                          {lang === "ar"
                            ? `حزمة شحن رصيد إضافي (${parsedTopupInfo.formatted})`
                            : `Top-up Tokens Pack (${parsedTopupInfo.formatted})`}
                        </h5>
                      </div>
                      <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 block mt-0.5">
                        +{parsedTopupInfo.tokens.toLocaleString()} Tokens · ${parsedTopupInfo.priceUsd} (دفعة واحدة / One-Time)
                      </span>
                    </div>
                    <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/30 shrink-0">
                      {lang === "ar" ? "شحن رصيد إضافي ⚡" : "Extra Top-Up ⚡"}
                    </Badge>
                  </div>

                  {/* End Date Selection & Custom Override Section for Topup */}
                  <div className="p-3 rounded-xl border border-blue-500/30 bg-blue-500/5 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-blue-700 dark:text-blue-300">
                        <Calendar className="w-4 h-4 shrink-0 text-blue-600" />
                        <span>{lang === "ar" ? "تاريخ انتهاء صلاحية الرصيد الإضافي (End Date):" : "Top-up Expiration End Date:"}</span>
                      </div>
                      <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-600 border-blue-500/30">
                        {approvalEndDateMode === "auto"
                          ? (lang === "ar" ? "تلقائي (مطابق للاشتراك)" : "Auto (Matches Sub)")
                          : (lang === "ar" ? "مخصص ✏️" : "Custom ✏️")}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setApprovalEndDateMode("auto")}
                        className={`p-2 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                          approvalEndDateMode === "auto"
                            ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                            : "bg-card border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>{lang === "ar" ? "مطابق للاشتراك (تلقائي)" : "Match Sub (Auto)"}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setApprovalEndDateMode("custom");
                          if (!approvalCustomEndDate) {
                            const baseDate = targetCompanySubEndDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                            setApprovalCustomEndDate(baseDate.toISOString().slice(0, 10));
                          }
                        }}
                        className={`p-2 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                          approvalEndDateMode === "custom"
                            ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                            : "bg-card border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                      >
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{lang === "ar" ? "تحديد تاريخ مخصص" : "Custom Date"}</span>
                      </button>
                    </div>

                    {approvalEndDateMode === "auto" ? (
                      <div className="text-[11px] text-muted-foreground bg-blue-500/10 border border-blue-500/20 rounded-lg p-2.5 flex items-center justify-between">
                        <span>{lang === "ar" ? "تاريخ انتهاء الاشتراك المعتمد:" : "Subscription End Date:"}</span>
                        <strong className="text-blue-700 dark:text-blue-300 font-mono text-xs">
                          {targetCompanySubEndDate
                            ? targetCompanySubEndDate.toLocaleDateString(lang === "ar" ? "ar-EG" : "en-GB", {
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                              })
                            : (lang === "ar" ? "مطابق لنهاية دورة الاشتراك (30 يوماً)" : "Matches Subscription Cycle (30 days)")}
                        </strong>
                      </div>
                    ) : (
                      <div className="space-y-2 pt-1">
                        <Input
                          type="date"
                          value={approvalCustomEndDate}
                          onChange={(e) => setApprovalCustomEndDate(e.target.value)}
                          className="h-9 text-xs font-mono bg-card border-blue-500/40"
                        />
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] text-muted-foreground font-medium">
                            {lang === "ar" ? "إضافة سريعة:" : "Quick set:"}
                          </span>
                          {[
                            { label: "+30 يوم", days: 30 },
                            { label: "+60 يوم", days: 60 },
                            { label: "+90 يوم", days: 90 },
                            { label: "+180 يوم", days: 180 },
                            { label: "+سنة (365)", days: 365 },
                          ].map((item) => (
                            <button
                              key={item.label}
                              type="button"
                              onClick={() => {
                                const d = new Date();
                                d.setDate(d.getDate() + item.days);
                                setApprovalCustomEndDate(d.toISOString().slice(0, 10));
                              }}
                              className="text-[10px] px-2 py-0.5 rounded-md border border-border bg-card text-foreground hover:bg-muted transition-colors font-mono cursor-pointer"
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : activeModalPlan && (
                <div className="p-3.5 rounded-xl border border-blue-500/30 bg-card shadow-sm space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-blue-600" />
                        <h5 className="text-xs font-bold text-foreground">
                          {lang === "ar" ? activeModalPlan.nameAr : activeModalPlan.nameEn}
                        </h5>
                        {activeModalPlan.badgeAr && (
                          <span className="text-[9px] bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/25 px-1.5 py-0.5 rounded-full font-semibold">
                            {lang === "ar" ? activeModalPlan.badgeAr : activeModalPlan.badgeEn}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] font-bold text-primary block mt-0.5">
                        {activeModalPlan.tokensFormatted || activeModalPlan.tokensMonthly?.toLocaleString()} Tokens · ${activeModalPlan.monthlyPriceUsd}/mo
                      </span>
                    </div>
                    <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30 shrink-0">
                      {lang === "ar" ? "الباقة المطابقة للطلب ✓" : "Matched Plan Tier ✓"}
                    </Badge>
                  </div>

                  <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                    {lang === "ar" ? activeModalPlan.descriptionAr : activeModalPlan.descriptionEn}
                  </p>

                  {/* Synchronized features pills */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-border/50">
                    <span className="text-[10px] px-2 py-0.5 rounded-md font-medium bg-muted text-muted-foreground">
                      {(activeModalPlan.channels?.length || 2)} {lang === "ar" ? "قنوات" : "channels"}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-md font-medium bg-muted text-muted-foreground">
                      {(activeModalPlan.tools?.length || 4)} {lang === "ar" ? "أدوات" : "tools"}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-md font-medium bg-muted text-muted-foreground">
                      {(activeModalPlan.dataSources?.length || 2)} {lang === "ar" ? "مصادر" : "sources"}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-md font-bold flex items-center gap-1 bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25">
                      <Clock className="w-3 h-3" />
                      {approvalRetentionDays && approvalRetentionDays > 0
                        ? `${approvalRetentionDays} ${lang === "ar" ? (approvalRetentionDays === 3 || approvalRetentionDays === 7 ? "أيام" : "يوم") : "d"}`
                        : (lang === "ar" ? "حفظ دائم" : "Permanent")}
                    </span>
                  </div>

                  {/* Quick Tier Switcher Pill Selector if Admin wishes to adjust tier before approving */}
                  {packagesCatalog?.packages && packagesCatalog.packages.length > 1 && (
                    <div className="pt-2 border-t border-border/50">
                      <span className="text-[10px] text-muted-foreground block mb-1 font-medium">
                        {lang === "ar" ? "تبديل أو تعديل الباقة المعتمدة بنقرة واحدة:" : "Switch tier before activating:"}
                      </span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {packagesCatalog.packages.map((pkg) => {
                          const isSelected = approvalSelectedPlanId === pkg.id;
                          return (
                            <button
                              key={pkg.id}
                              type="button"
                              onClick={() => {
                                setApprovalSelectedPlanId(pkg.id);
                                setApprovalRetentionDays(pkg.retentionDays ?? (pkg.id === "pro" ? 7 : (pkg.id === "starter" ? 3 : 14)));
                              }}
                              className={`text-[10px] px-2 py-0.5 rounded-lg border font-semibold transition-all cursor-pointer ${
                                isSelected
                                  ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                                  : "bg-muted/40 border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                              }`}
                            >
                              {lang === "ar" ? pkg.nameAr : pkg.nameEn}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* End Date Option for Regular Plan Approval (when not topup) */}
              {!isApprovalTicketTopup && (
                <div className="p-3 rounded-xl border border-border/80 bg-muted/20 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                      <Calendar className="w-4 h-4 text-primary" />
                      <span>{lang === "ar" ? "تاريخ انتهاء صلاحية الاشتراك (End Date):" : "Subscription Expiration End Date:"}</span>
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      {approvalEndDateMode === "auto"
                        ? (lang === "ar" ? "تلقائي (حسب دورة الباقة)" : "Auto (Per Cycle)")
                        : (lang === "ar" ? "مخصص ✏️" : "Custom ✏️")}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setApprovalEndDateMode("auto")}
                      className={`p-2 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        approvalEndDateMode === "auto"
                          ? "bg-primary text-primary-foreground border-primary shadow-xs"
                          : "bg-card border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{lang === "ar" ? "تلقائي (حسب الباقة)" : "Auto (Default)"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setApprovalEndDateMode("custom");
                        if (!approvalCustomEndDate) {
                          const baseDate = targetCompanySubEndDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                          setApprovalCustomEndDate(baseDate.toISOString().slice(0, 10));
                        }
                      }}
                      className={`p-2 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        approvalEndDateMode === "custom"
                          ? "bg-primary text-primary-foreground border-primary shadow-xs"
                          : "bg-card border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{lang === "ar" ? "تحديد تاريخ مخصص" : "Custom End Date"}</span>
                    </button>
                  </div>

                  {approvalEndDateMode === "custom" && (
                    <div className="space-y-2 pt-1">
                      <Input
                        type="date"
                        value={approvalCustomEndDate}
                        onChange={(e) => setApprovalCustomEndDate(e.target.value)}
                        className="h-9 text-xs font-mono bg-card"
                      />
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] text-muted-foreground font-medium">
                          {lang === "ar" ? "إضافة سريعة:" : "Quick set:"}
                        </span>
                        {[
                          { label: "+30 يوم", days: 30 },
                          { label: "+60 يوم", days: 60 },
                          { label: "+90 يوم", days: 90 },
                          { label: "+180 يوم", days: 180 },
                          { label: "+سنة (365)", days: 365 },
                        ].map((item) => (
                          <button
                            key={item.label}
                            type="button"
                            onClick={() => {
                              const d = new Date();
                              d.setDate(d.getDate() + item.days);
                              setApprovalCustomEndDate(d.toISOString().slice(0, 10));
                            }}
                            className="text-[10px] px-2 py-0.5 rounded-md border border-border bg-card text-foreground hover:bg-muted transition-colors font-mono cursor-pointer"
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Request Summary Box */}
              <div className="p-3 bg-muted/40 rounded-xl border border-border/70 text-xs space-y-1.5">
                <div className="font-bold text-foreground text-xs">{approvalTicket.title}</div>
                <p className="text-muted-foreground line-clamp-3 leading-relaxed whitespace-pre-line text-[11px]">
                  {approvalTicket.description}
                </p>
              </div>

              {/* Selection Prompt */}
              <div>
                <label className="text-xs font-semibold text-foreground block mb-2">
                  {lang === "ar"
                    ? "يرجى تحديد حالة سداد الفاتورة للعميل (لتحديث عمود Paid في صفحة الفواتير):"
                    : "Select invoice payment status (updates the Paid column in Bills & Invoices):"}
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* Option 1: Paid */}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setApprovalIsPaid(true)}
                    className={`p-3 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-2.5 select-none ${
                      approvalIsPaid === true
                        ? "border-emerald-500 bg-emerald-500/10 shadow-sm"
                        : "border-border/60 hover:border-emerald-500/40 bg-card"
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                        approvalIsPaid === true ? "bg-emerald-600 text-white" : "border-2 border-muted-foreground/40"
                      }`}
                    >
                      {approvalIsPaid === true && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="font-bold text-xs text-emerald-600 dark:text-emerald-400 block">
                        {lang === "ar" ? "✅ مسددة (Paid)" : "✅ Paid"}
                      </span>
                      <span className="text-[10px] text-muted-foreground leading-tight block mt-0.5">
                        {lang === "ar"
                          ? isApprovalTicketTopup
                            ? "شحن الرموز فوراً لحساب العميل وإصدار فاتورة مسددة."
                            : "تم استلام المبلغ، وتفعيل الباقة، وتظهر مسددة في الفواتير."
                          : isApprovalTicketTopup
                          ? "Credit tokens immediately to balance and mark invoice Paid."
                          : "Payment received, marked as Paid in Bills."}
                      </span>
                    </div>
                  </div>

                  {/* Option 2: Unpaid */}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setApprovalIsPaid(false)}
                    className={`p-3 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-2.5 select-none ${
                      approvalIsPaid === false
                        ? "border-amber-500 bg-amber-500/10 shadow-sm"
                        : "border-border/60 hover:border-amber-500/40 bg-card"
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                        approvalIsPaid === false ? "bg-amber-600 text-white" : "border-2 border-muted-foreground/40"
                      }`}
                    >
                      {approvalIsPaid === false && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="font-bold text-xs text-amber-600 dark:text-amber-400 block">
                        {lang === "ar" ? "⏳ غير مسددة (Unpaid)" : "⏳ Unpaid"}
                      </span>
                      <span className="text-[10px] text-muted-foreground leading-tight block mt-0.5">
                        {lang === "ar"
                          ? isApprovalTicketTopup
                            ? "إصدار فاتورة غير مسددة، ويبقى رصيد الرموز معلقاً حتى تأكيد السداد من صفحة الفواتير."
                            : "تفعيل آجل أو تجريبي، وتصدر الفاتورة كـ غير مسددة."
                          : isApprovalTicketTopup
                          ? "Issue invoice as Unpaid; tokens remain pending until payment is confirmed in Bills."
                          : "Awaiting payment, marked as Unpaid in Bills."}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0 mt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setApprovalTicket(null)}
              disabled={isApprovingPlan}
              className="text-xs h-9"
            >
              {lang === "ar" ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              size="sm"
              onClick={() => handleConfirmApproval(approvalIsPaid)}
              disabled={isApprovingPlan}
              className={`text-xs h-9 font-semibold text-white gap-1.5 ${
                approvalIsPaid ? "bg-emerald-600 hover:bg-emerald-700" : "bg-amber-600 hover:bg-amber-700"
              }`}
            >
              {isApprovingPlan ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5" />
              )}
              <span>
                {lang === "ar"
                  ? approvalIsPaid
                    ? isApprovalTicketTopup
                      ? "تأكيد شحن الرصيد كـ مسددة ⚡"
                      : "تأكيد التفعيل كـ مسددة 🧾"
                    : isApprovalTicketTopup
                    ? "اعتماد وإصدار فاتورة (الرصيد معلق) ⏳"
                    : "تأكيد التفعيل كـ غير مسددة 🧾"
                  : approvalIsPaid
                  ? isApprovalTicketTopup
                    ? "Confirm Top-Up (Paid) ⚡"
                    : "Confirm as Paid 🧾"
                  : isApprovalTicketTopup
                  ? "Confirm (Tokens Pending) ⏳"
                  : "Confirm as Unpaid 🧾"}
              </span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
