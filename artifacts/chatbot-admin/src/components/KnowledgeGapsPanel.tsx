import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch, getListClientKnowledgeFilesQueryKey } from "@workspace/api-client-react";
import { useLanguage } from "@/hooks/use-language";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ThumbsUp,
  ThumbsDown,
  UserCheck,
  Sparkles,
  Plus,
  Loader2,
  RefreshCw,
  MessageSquareWarning,
  CheckCircle2,
} from "lucide-react";

interface KnowledgeGapItem {
  id: number;
  question: string;
  botResponse: string;
  reason: "negative_feedback" | "handoff" | "both";
  channel: string;
  createdAt: string;
  occurrences: number;
}

interface KnowledgeGapsResponse {
  stats: {
    totalRated: number;
    positiveCount: number;
    negativeCount: number;
    handoffCount: number;
    satisfactionRate: number | null;
  };
  gaps: KnowledgeGapItem[];
}

export function KnowledgeGapsPanel() {
  const { lang } = useLanguage();
  const isAr = lang === "ar";
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedGap, setSelectedGap] = useState<KnowledgeGapItem | null>(null);
  const [faqTitle, setFaqTitle] = useState("");
  const [faqQuestion, setFaqQuestion] = useState("");
  const [faqAnswer, setFaqAnswer] = useState("");
  const [saving, setSaving] = useState(false);

  const { data, isLoading, refetch, isFetching } = useQuery<KnowledgeGapsResponse>({
    queryKey: ["client-knowledge-gaps"],
    queryFn: () => customFetch("/api/client/knowledge-gaps"),
    staleTime: 60_000,
  });

  const openAddDialog = (gap: KnowledgeGapItem) => {
    setSelectedGap(gap);
    setFaqTitle(`FAQ - ${gap.question.slice(0, 40)}`);
    setFaqQuestion(gap.question);
    setFaqAnswer("");
  };

  const handleSaveToKnowledge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!faqQuestion.trim() || !faqAnswer.trim()) {
      toast({
        title: isAr ? "يرجى كتابة السؤال والإجابة" : "Please enter both question and answer",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const content = `Question: ${faqQuestion.trim()}\nAnswer: ${faqAnswer.trim()}`;
      const fileName = `${(faqTitle.trim() || "faq-gap").replace(/[^a-zA-Z0-9\u0600-\u06FF_-]+/g, "-").slice(0, 60)}.txt`;

      await customFetch("/api/client/company/knowledge-files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName,
          fileType: "txt",
          content,
        }),
      });

      queryClient.invalidateQueries({ queryKey: getListClientKnowledgeFilesQueryKey() });
      setSelectedGap(null);
      toast({
        title: isAr ? "تمت الإضافة لملفات المعرفة بنجاح" : "Added to Knowledge Base",
        description: isAr
          ? "سيستخدم البوت هذه الإجابة تلقائيًا في الردود القادمة."
          : "Your bot will now use this answer automatically.",
      });
    } catch (err: any) {
      toast({
        title: isAr ? "تعذرت الإضافة" : "Failed to save",
        description: err?.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const stats = data?.stats;
  const gaps = data?.gaps ?? [];

  return (
    <Card className="bg-card border border-[#DCE7FF] dark:border-slate-800 rounded-2xl shadow-md shadow-[#2D5BE3]/15 border-l-4 border-l-[#2D5BE3]">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <MessageSquareWarning className="w-5 h-5 text-primary" />
              {isAr ? "تقييم الردود وتحليل فجوات المعرفة (CSAT)" : "Response Ratings & Knowledge Gaps (CSAT)"}
            </CardTitle>
            <CardDescription className="mt-1">
              {isAr
                ? "تابع تقييمات الزوار (👍 / 👎) وأكثر الأسئلة التي احتاجت تدخلاً بشريًا لتضيف إجاباتها لملفات المعرفة."
                : "Monitor visitor ratings (👍 / 👎) and questions that triggered human handoff so you can add answers to your Knowledge Base."}
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
            {isAr ? "تحديث" : "Refresh"}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* CSAT Summary Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-border/60 bg-secondary/20 p-3">
            <span className="text-[11px] text-muted-foreground block">
              {isAr ? "نسبة الرضا" : "Satisfaction"}
            </span>
            <span className="text-xl font-extrabold text-foreground tabular-nums">
              {stats?.satisfactionRate !== null && stats?.satisfactionRate !== undefined
                ? `${stats.satisfactionRate}%`
                : "—"}
            </span>
          </div>

          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <ThumbsUp className="w-3 h-3" />
              {isAr ? "تقييمات إيجابية" : "Positive (👍)"}
            </span>
            <span className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">
              {stats?.positiveCount ?? 0}
            </span>
          </div>

          <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3">
            <span className="text-[11px] text-rose-600 dark:text-rose-400 flex items-center gap-1">
              <ThumbsDown className="w-3 h-3" />
              {isAr ? "تقييمات سلبية" : "Negative (👎)"}
            </span>
            <span className="text-xl font-extrabold text-rose-600 dark:text-rose-400 tabular-nums">
              {stats?.negativeCount ?? 0}
            </span>
          </div>

          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
            <span className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <UserCheck className="w-3 h-3" />
              {isAr ? "تدخل بشري" : "Handoffs"}
            </span>
            <span className="text-xl font-extrabold text-amber-600 dark:text-amber-400 tabular-nums">
              {stats?.handoffCount ?? 0}
            </span>
          </div>
        </div>

        {/* Knowledge Gaps List */}
        {isLoading ? (
          <div className="py-8 flex items-center justify-center text-muted-foreground gap-2 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            {isAr ? "جاري تحليل فجوات المعرفة..." : "Analyzing knowledge gaps..."}
          </div>
        ) : gaps.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-center space-y-1.5">
            <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto" />
            <p className="text-sm font-semibold text-foreground">
              {isAr ? "لا توجد فجوات معرفة حاليًا" : "No Knowledge Gaps Detected"}
            </p>
            <p className="text-xs text-muted-foreground">
              {isAr
                ? "أي سؤال يحصل على تقييم سلبي (👎) أو يطلب تدخلاً بشريًا سيظهر هنا لإضافته لملفات المعرفة."
                : "Any question receiving a negative rating (👎) or triggering human handoff will appear here."}
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {gaps.map((gap) => (
              <div
                key={gap.id}
                className="rounded-xl border border-border/70 bg-background/60 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {gap.reason === "negative_feedback" || gap.reason === "both" ? (
                      <Badge variant="outline" className="text-[10px] border-rose-500/30 bg-rose-500/10 text-rose-500">
                        👎 {isAr ? "تقييم سلبي" : "Negative Rating"}
                      </Badge>
                    ) : null}
                    {gap.reason === "handoff" || gap.reason === "both" ? (
                      <Badge variant="outline" className="text-[10px] border-amber-500/30 bg-amber-500/10 text-amber-500">
                        🤝 {isAr ? "تدخل بشري" : "Human Handoff"}
                      </Badge>
                    ) : null}
                    {gap.occurrences > 1 && (
                      <Badge variant="secondary" className="text-[10px]">
                        {gap.occurrences}× {isAr ? "تكرر" : "repeated"}
                      </Badge>
                    )}
                    <span className="text-[10px] text-muted-foreground uppercase">{gap.channel}</span>
                  </div>
                  <p className="text-sm font-semibold text-foreground break-words">{gap.question}</p>
                  {gap.botResponse && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {isAr ? "رد البوت:" : "Bot reply:"} {gap.botResponse}
                    </p>
                  )}
                </div>

                <Button
                  type="button"
                  size="sm"
                  onClick={() => openAddDialog(gap)}
                  className="shrink-0 gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {isAr ? "إضافة للمعرفة" : "Add to Knowledge"}
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Add Q&A to Knowledge Dialog */}
      <Dialog open={!!selectedGap} onOpenChange={(open) => !open && setSelectedGap(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              {isAr ? "إضافة سؤال وجواب لملفات المعرفة" : "Add Q&A to Knowledge Base"}
            </DialogTitle>
            <DialogDescription>
              {isAr
                ? "اكتب الإجابة المثالية لهذا السؤال وسيتم حفظها وفهرستها تلقائيًا في قاعدة معرفة البوت."
                : "Write the ideal answer for this customer question. It will be saved and indexed automatically."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveToKnowledge} className="space-y-3.5">
            <div>
              <label className="text-xs font-semibold block mb-1">
                {isAr ? "عنوان الملف" : "Entry Title"}
              </label>
              <Input
                value={faqTitle}
                onChange={(e) => setFaqTitle(e.target.value)}
                placeholder="FAQ"
              />
            </div>

            <div>
              <label className="text-xs font-semibold block mb-1">
                {isAr ? "سؤال العميل" : "Customer Question"}
              </label>
              <Textarea
                rows={2}
                value={faqQuestion}
                onChange={(e) => setFaqQuestion(e.target.value)}
              />
            </div>

            <div>
              <label className="text-xs font-semibold block mb-1">
                {isAr ? "الإجابة الصحيحة للبوت *" : "Ideal Bot Answer *"}
              </label>
              <Textarea
                rows={4}
                required
                value={faqAnswer}
                onChange={(e) => setFaqAnswer(e.target.value)}
                placeholder={isAr ? "اكتب الإجابة الواضحة هنا..." : "Write the clear answer here..."}
              />
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setSelectedGap(null)} disabled={saving}>
                {isAr ? "إلغاء" : "Cancel"}
              </Button>
              <Button type="submit" disabled={saving} className="gap-1.5">
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {isAr ? "حفظ في المعرفة" : "Save to Knowledge"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
