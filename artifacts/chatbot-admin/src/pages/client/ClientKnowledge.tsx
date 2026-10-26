import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Globe, FileText, Plug, Database, Sparkles, ChevronDown, Loader2, RotateCcw, Upload, Trash2, Link2, FileSpreadsheet, FileJson, Sheet as SheetIcon, ExternalLink, Search, BookOpen, Layers, Code2, CheckCircle2, AlertCircle, Eye, EyeOff, ShoppingBag, Lock, Plus } from "lucide-react";
import { Link } from "wouter";
import {
  useGetClientCompany, useUpdateClientCompany,
  useListClientKnowledgeFiles, useCreateClientKnowledgeFile, useDeleteClientKnowledgeFile,
  getGetClientCompanyQueryKey, getListClientKnowledgeFilesQueryKey, customFetch,
} from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/hooks/use-language";
import { useToast } from "@/hooks/use-toast";

import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";


const FILE_TYPE_ICON: Record<string, typeof FileText> = {
  pdf: FileText,
  excel: SheetIcon,
  csv: FileSpreadsheet,
  json: FileJson,
  google_sheet: SheetIcon,
  txt: FileText,
};

const FILE_TYPE_LABEL: Record<string, string> = {
  pdf: "PDF (كتاب / مستند)",
  excel: "Excel",
  csv: "CSV",
  json: "JSON",
  google_sheet: "Google Sheet",
  txt: "TXT (نص)",
};



function WebsiteSyncButton({ companyWebsiteLastSynced }: { companyWebsiteLastSynced: string | null }) {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await customFetch<{ success: boolean; websiteLastSynced: string | null }>("/client/company/sync-website", { method: "POST" });
      if (res.success) {
        await queryClient.invalidateQueries({ queryKey: getGetClientCompanyQueryKey() });
        toast({ title: lang === "ar" ? "تمت مزامنة الموقع" : "Website synced", description: lang === "ar" ? "تم تحديث محتوى الموقع بنجاح." : "Content has been refreshed." });
      } else {
        toast({ title: t("btn_syncing"), description: lang === "ar" ? "تعذر جلب بيانات الموقع." : "Could not fetch the website.", variant: "destructive" });
      }
    } catch {
      toast({ title: lang === "ar" ? "فشلت المزامنة" : "Sync failed", description: lang === "ar" ? "حدث خطأ أثناء المزامنة." : "An error occurred.", variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <Button type="button" variant="outline" size="sm" onClick={handleSync} disabled={syncing} className="gap-2">
        {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
        {syncing ? t("btn_syncing") : t("btn_sync_now")}
      </Button>
      {companyWebsiteLastSynced && (
        <span className="text-xs text-muted-foreground">
          {lang === "ar" ? "آخر مزامنة: " : "Last synced: "} {new Date(companyWebsiteLastSynced).toLocaleString()}
        </span>
      )}
    </div>
  );
}

function KnowledgeFilesCard() {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sheetLink, setSheetLink] = useState("");
  const [uploadingCount, setUploadingCount] = useState(0);

  // Semantic Search Tester State
  const [testerQuery, setTesterQuery] = useState("");
  const [testerLoading, setTesterLoading] = useState(false);
  const [testerResults, setTesterResults] = useState<Array<{
    id: number;
    fileId: number;
    fileName: string;
    chunkIndex: number;
    content: string;
    score: number;
  }> | null>(null);

  const { data: files, isLoading } = useListClientKnowledgeFiles({
    query: { queryKey: getListClientKnowledgeFilesQueryKey(), refetchInterval: (query) => (query.state.data?.some((f) => f.status === "processing") ? 3000 : false) },
  });

  const createFile = useCreateClientKnowledgeFile();
  const deleteFile = useDeleteClientKnowledgeFile();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListClientKnowledgeFilesQueryKey() });

  const handleFilesSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const selected = Array.from(fileList);
    setUploadingCount((c) => c + selected.length);

    for (const file of selected) {
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/client/company/knowledge-files/upload", {
          method: "POST",
          credentials: "include",
          body: formData,
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error || `Upload failed (${res.status})`);
        invalidate();
      } catch (err: any) {
        toast({ title: `${lang === "ar" ? "فشل إضافة" : "Failed to add"} ${file.name}`, description: err?.message, variant: "destructive" });
      } finally {
        setUploadingCount((c) => c - 1);
      }
    }
  };

  const handleAddSheetLink = async () => {
    const link = sheetLink.trim();
    if (!link) return;
    try {
      await createFile.mutateAsync({
        data: { fileName: "Google Sheet", fileType: "google_sheet", sourceUrl: link },
      });
      setSheetLink("");
      invalidate();
    } catch (err: any) {
      toast({ title: lang === "ar" ? "فشل إضافة جدول جوجل" : "Failed to add Google Sheet", description: err?.message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteFile.mutateAsync({ id });
      invalidate();
    } catch (err: any) {
      toast({ title: lang === "ar" ? "فشل الحذف" : "Failed to delete", description: err?.message, variant: "destructive" });
    }
  };

  const handleRunSemanticSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const q = testerQuery.trim();
    if (!q) return;

    setTesterLoading(true);
    try {
      const res = await customFetch<{
        query: string;
        count: number;
        results: Array<{
          id: number;
          fileId: number;
          fileName: string;
          chunkIndex: number;
          content: string;
          score: number;
        }>;
      }>("/api/client/company/knowledge-files/semantic-search", {
        method: "POST",
        body: JSON.stringify({ query: q }),
      });
      setTesterResults(res.results || []);
    } catch (err: any) {
      toast({
        title: lang === "ar" ? "تعذر إجراء البحث الدلالي" : "Semantic search failed",
        description: err?.message,
        variant: "destructive",
      });
    } finally {
      setTesterLoading(false);
    }
  };

  return (
    <Card className="bg-card border border-[#DCE7FF] dark:border-slate-800 rounded-2xl shadow-md shadow-[#2D5BE3]/15 hover:shadow-lg hover:shadow-[#2D5BE3]/25 transition-all overflow-hidden border-l-4 border-l-[#2D5BE3]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" />
          {t("company_knowledge_files")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.xlsx,.xls,.csv,.json,.txt"
            className="hidden"
            onChange={(e) => {
              handleFilesSelected(e.target.files);
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingCount > 0}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md shadow-blue-600/25 px-5 py-2.5 h-auto text-sm"
          >
            {uploadingCount > 0 ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {lang === "ar" ? "جاري الرفع والفهرسة..." : "Uploading & Indexing…"}</>
            ) : (
              <><Upload className="w-4 h-4 mr-2" /> {lang === "ar" ? "رفع ملفات / كتب" : "Upload Files / Books"}</>
            )}
          </Button>
          <span className="text-xs text-muted-foreground">{t("company_allowed_files")}</span>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[240px]">
            <label className="text-sm font-medium mb-1.5 block">{lang === "ar" ? "رابط جدول بيانات جوجل" : "Google Sheet link"}</label>
            <Input
              value={sheetLink}
              onChange={(e) => setSheetLink(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/..."
              className="bg-background"
            />
          </div>
          <Button type="button" variant="outline" onClick={handleAddSheetLink} disabled={!sheetLink.trim() || createFile.isPending}>
            <Link2 className="w-4 h-4 mr-2" /> {lang === "ar" ? "إضافة الجدول" : "Add Sheet"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground -mt-2">
          {lang === "ar" ? 'يجب ضبط المشاركة على "أي شخص لديه الرابط — عارض" ليتمكن الذكاء الاصطناعي من قراءته.' : 'Sharing must be set to "Anyone with the link — Viewer" so the AI can read it.'}
        </p>

        <div className="rounded-lg border border-[#DCE7FF] divide-y divide-border/40">
          {isLoading ? (
            <div className="p-4"><Skeleton className="h-10 w-full" /></div>
          ) : !files || files.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">{lang === "ar" ? "لا توجد ملفات أو كتب مضافة بعد." : "No knowledge files or books yet."}</div>
          ) : (
            files.map((file) => {
              const Icon = FILE_TYPE_ICON[file.fileType] ?? FileText;
              const chunkCount = (file as any).chunkCount ?? 0;
              return (
                <div key={file.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{file.fileName}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-2">
                        <span>{FILE_TYPE_LABEL[file.fileType] ?? file.fileType}</span>
                        {file.sourceUrl ? <span className="truncate">· {file.sourceUrl}</span> : null}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {chunkCount > 0 && (
                      <span className="text-[11px] bg-primary/10 text-primary font-medium px-2 py-0.5 rounded-full border border-primary/20 flex items-center gap-1">
                        <Layers className="w-3 h-3" />
                        {chunkCount} {lang === "ar" ? "مقطع دلالي (RAG)" : "chunks"}
                      </span>
                    )}
                    {file.status === "processing" && (
                      <span className="text-xs flex items-center gap-1 text-amber-600"><Loader2 className="w-3 h-3 animate-spin" /> {lang === "ar" ? "جاري الفهرسة" : "Indexing"}</span>
                    )}
                    {file.status === "ready" && (
                      <span className="text-xs text-emerald-600 font-medium">✓ {lang === "ar" ? "جاهز" : "Ready"}</span>
                    )}
                    {file.status === "error" && (
                      <span className="text-xs text-red-600">✗ {lang === "ar" ? "خطأ" : "Error"}</span>
                    )}
                    <ConfirmDeleteDialog onConfirm={() => handleDelete(file.id)}>
                      <Button type="button" variant="ghost" size="icon" disabled={deleteFile.isPending}>
                        <Trash2 className="w-4 h-4 text-muted-foreground" />
                      </Button>
                    </ConfirmDeleteDialog>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Semantic Search & RAG Tester */}
        <div className="pt-4 mt-6 border-t border-[#DCE7FF] space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <h4 className="text-sm font-semibold">
                {lang === "ar" ? "مختبر البحث الدلالي والاسترجاع (Semantic Search & RAG Tester)" : "Semantic Search & RAG Tester"}
              </h4>
            </div>
            <span className="text-[11px] text-muted-foreground bg-muted/60 px-2.5 py-0.5 rounded-full border border-border/40 font-mono">
              pgvector / Hybrid Vector
            </span>
          </div>

          <p className="text-xs text-muted-foreground">
            {lang === "ar"
              ? "اكتب أي سؤال لاختبار كيفية استرجاع النظام لأدق الفقرات من كتبك وملفاتك تلقائياً وبأقل استهلاك ممكن للتوكنز."
              : "Test any query to see how the system dynamically retrieves the most relevant paragraphs from your documents and books."}
          </p>

          <form onSubmit={handleRunSemanticSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Input
                value={testerQuery}
                onChange={(e) => setTesterQuery(e.target.value)}
                placeholder={lang === "ar" ? "مثال: ما هي شروط الاستبدال والاسترجاع؟ أو سياسة الدفع..." : "e.g., What is your return policy or warranty terms?"}
                className="bg-background"
              />
            </div>
            <Button type="submit" disabled={!testerQuery.trim() || testerLoading} className="gap-2">
              {testerLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              {lang === "ar" ? "بحث دلالي" : "Search"}
            </Button>
          </form>

          {testerResults !== null && (
            <div className="space-y-2 mt-3 pt-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{lang === "ar" ? `الفقرات الأكثر صلة (${testerResults.length})` : `Retrieved chunks (${testerResults.length})`}</span>
                {testerResults.length > 0 && (
                  <span className="text-emerald-600 font-medium">{lang === "ar" ? "مرتبة حسب درجة التشابه الرياضي" : "Ranked by semantic cosine similarity"}</span>
                )}
              </div>

              {testerResults.length === 0 ? (
                <div className="p-4 rounded-lg bg-muted/30 border border-border/40 text-center text-xs text-muted-foreground">
                  {lang === "ar" ? "لم يتم العثور على مقاطع مطابقة. تأكد من رفع ملفات أو كتب جاهزة أولاً." : "No matching semantic chunks found. Ensure you have ready knowledge files uploaded."}
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {testerResults.map((item, idx) => (
                    <div key={item.id || idx} className="p-3 rounded-lg border border-[#DCE7FF] bg-muted/20 text-xs space-y-1.5">
                      <div className="flex items-center justify-between font-medium">
                        <div className="flex items-center gap-1.5 text-foreground truncate max-w-[70%]">
                          <BookOpen className="w-3.5 h-3.5 text-primary shrink-0" />
                          <span className="truncate">{item.fileName}</span>
                          <span className="text-[10px] text-muted-foreground">#{item.chunkIndex + 1}</span>
                        </div>
                        <span className="text-[11px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">
                          {Math.round(item.score * 100)}% {lang === "ar" ? "تطابق دلالي" : "match"}
                        </span>
                      </div>
                      <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap text-[11px] font-mono bg-background/60 p-2 rounded border border-border/30">
                        {item.content}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function WordPressInlineCard() {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const [wpData, setWpData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [apiUrl, setApiUrl] = useState("");
  const [username, setUsername] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [autoSync, setAutoSync] = useState(true);

  const loadWp = async () => {
    try {
      setLoading(true);
      const data = await customFetch<any>("/api/client/wordpress");
      setWpData(data);
      if (data) {
        setApiUrl(data.apiUrl || "");
        setUsername(data.username || "");
        setAutoSync(data.autoSync ?? true);
      }
    } catch {
      // not configured
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWp();
  }, []);

  const handleDelete = async () => {
    if (!confirm(lang === "ar" ? "هل أنت متأكد من رغبتك في فصل وحذف ربط ووردبريس؟" : "Are you sure you want to disconnect WordPress?")) {
      return;
    }
    setDeleting(true);
    try {
      await customFetch("/api/client/wordpress", { method: "DELETE" });
      setWpData(null);
      setApiUrl("");
      setUsername("");
      setAppPassword("");
      toast({
        title: lang === "ar" ? "تم فصل ربط ووردبريس بنجاح" : "WordPress disconnected successfully",
      });
    } catch (err: any) {
      toast({
        title: lang === "ar" ? "فشل فصل الربط" : "Failed to disconnect",
        description: err?.message,
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleTest = async () => {
    if (!apiUrl) {
      toast({ title: lang === "ar" ? "يرجى إدخال الرابط" : "Enter API URL", variant: "destructive" });
      return;
    }
    setTesting(true);
    try {
      const res = await customFetch<{ ok: boolean; error?: string; siteName?: string }>("/api/client/wordpress/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiUrl, username: username || undefined, appPassword: appPassword || undefined }),
      });
      if (res.ok) {
        toast({ title: lang === "ar" ? "الاتصال ناجح ✓" : "Connection successful ✓", description: res.siteName ? `Site: ${res.siteName}` : "WordPress API is reachable" });
      } else {
        toast({ title: lang === "ar" ? "فشل الاتصال" : "Connection failed", description: res.error, variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: lang === "ar" ? "فشل الاختبار" : "Test failed", description: e.message, variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!apiUrl.trim()) {
      if (wpData) {
        await handleDelete();
        return;
      }
      toast({ title: lang === "ar" ? "يرجى إدخال رابط ووردبريس" : "Enter WordPress API URL", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const saved = await customFetch<any>("/api/client/wordpress", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiUrl: apiUrl.trim(),
          username: username.trim() || undefined,
          appPassword: appPassword.trim() || undefined,
          autoSync,
        }),
      });
      setWpData(saved);
      setAppPassword("");
      toast({
        title: lang === "ar" ? "تم حفظ إعدادات ووردبريس ✓" : "WordPress settings saved ✓",
        description: lang === "ar" ? "جاري المزامنة في الخلفية..." : "Background sync started...",
      });
      // Poll for sync completion after a short delay
      setTimeout(() => loadWp(), 4000);
    } catch (e: any) {
      toast({ title: lang === "ar" ? "فشل الحفظ" : "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await customFetch<{ ok: boolean; integration: any }>("/api/client/wordpress/sync", { method: "POST" });
      if (res.integration) setWpData(res.integration);
      toast({
        title: res.ok ? (lang === "ar" ? "اكتملت المزامنة" : "Sync complete") : (lang === "ar" ? "فشلت المزامنة" : "Sync failed"),
        description: res.ok ? (lang === "ar" ? `تمت مزامنة ${res.integration?.totalItems ?? 0} عنصر.` : `Synced ${res.integration?.totalItems ?? 0} items.`) : res.integration?.errorMessage,
        variant: res.ok ? "default" : "destructive",
      });
    } catch {
      toast({ title: lang === "ar" ? "فشلت المزامنة" : "Sync failed", variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Card className="bg-card border border-[#DCE7FF] dark:border-slate-800 rounded-2xl shadow-md shadow-[#2D5BE3]/15 hover:shadow-lg hover:shadow-[#2D5BE3]/25 transition-all overflow-hidden border-l-4 border-l-[#2D5BE3]">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="w-5 h-5 text-blue-500" />
            {t("data_source_wordpress")}
          </CardTitle>
        </div>
        <CardDescription>{t("data_source_wordpress_desc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <label className="text-xs font-medium">{lang === "ar" ? "رابط WordPress REST API" : "WordPress REST API URL"}</label>
              <Input
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder="https://yoursite.com/wp-json/"
                className="bg-background font-mono text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                {lang === "ar"
                  ? "أدخل رابط الموقع الأساسي فقط مثال: https://myblog.com/wp-json/ — الروابط الكاملة مثل /wp/v2/posts تُقبل أيضاً."
                  : "Enter your site base URL, e.g. https://myblog.com/wp-json/ — full paths like /wp/v2/posts are also accepted."}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">{lang === "ar" ? "اسم المستخدم (اختياري)" : "Username (Optional)"}</label>
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  className="bg-background"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">{lang === "ar" ? "كلمة مرور التطبيق (اختياري)" : "Application Password (Optional)"}</label>
                <PasswordInput
                  value={appPassword}
                  onChange={(e) => setAppPassword(e.target.value)}
                  placeholder={wpData?.hasAppPassword ? "••••••••••••" : "xxxx xxxx xxxx xxxx"}
                  className="bg-background"
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-[#DCE7FF] p-3 bg-muted/20">
              <div>
                <p className="text-xs font-medium">{lang === "ar" ? "المزامنة التلقائية الدورية" : "Auto-Sync WordPress Content"}</p>
                <p className="text-[11px] text-muted-foreground">{lang === "ar" ? "مزامنة المقالات والصفحات كل 6 ساعات" : "Sync posts and pages every 6 hours"}</p>
              </div>
              <Switch checked={autoSync} onCheckedChange={setAutoSync} />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/40">
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={handleTest} disabled={testing || !apiUrl.trim()} className="text-xs">
                  {testing ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Plug className="w-3.5 h-3.5 mr-1" />}
                  {lang === "ar" ? "اختبار الاتصال" : "Test Connection"}
                </Button>
                {wpData?.status === "connected" && (
                  <Button type="button" variant="outline" size="sm" onClick={handleSync} disabled={syncing} className="text-xs">
                    {syncing ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5 mr-1" />}
                    {lang === "ar" ? "مزامنة الآن" : "Sync Now"}
                  </Button>
                )}
                {wpData && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="text-xs text-destructive hover:bg-destructive/10 border-destructive/30"
                  >
                    {deleting ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 mr-1" />}
                    {lang === "ar" ? "فصل الربط" : "Disconnect"}
                  </Button>
                )}
              </div>
              <Button
                type="button"
                size="sm"
                onClick={handleSave}
                disabled={saving || deleting || (!apiUrl.trim() && !wpData)}
                className="text-xs"
              >
                {saving || deleting ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
                {!apiUrl.trim() && wpData
                  ? (lang === "ar" ? "حذف الربط" : "Disconnect")
                  : (lang === "ar" ? "حفظ وربط" : "Save & Connect")}
              </Button>
            </div>

            {wpData && (
              <div className="flex items-center justify-between text-xs bg-muted/30 p-2.5 rounded-lg border border-[#DCE7FF]">
                <span className="text-muted-foreground">
                  {lang === "ar" ? "الحالة: " : "Status: "}
                  <strong className={wpData.status === "connected" ? "text-emerald-500" : "text-amber-500"}>
                    {wpData.status === "connected" ? (lang === "ar" ? "متصل بنجاح" : "Connected") : wpData.status}
                  </strong>
                </span>
                {wpData.totalItems > 0 && (
                  <span className="text-muted-foreground">
                    {lang === "ar" ? `العناصر المتزامنة: ${wpData.totalItems}` : `Total Synced: ${wpData.totalItems}`}
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function RestApiInlineCard() {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const [apiData, setApiData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Form inputs
  const [apiUrl, setApiUrl] = useState("");
  const [httpMethod, setHttpMethod] = useState<"GET" | "POST">("GET");
  const [headerName, setHeaderName] = useState("");
  const [headerValue, setHeaderValue] = useState("");
  const [dataExtractionPath, setDataExtractionPath] = useState("");
  const [autoSync, setAutoSync] = useState(true);

  // Live test preview
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    error?: string;
    totalItems?: number;
    samplePreview?: string;
  } | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const loadApi = async () => {
    try {
      setLoading(true);
      const data = await customFetch<any>("/api/client/rest-api");
      setApiData(data);
      if (data) {
        setApiUrl(data.apiUrl || "");
        setHttpMethod((data.httpMethod as "GET" | "POST") || "GET");
        setHeaderName(data.headerName || "");
        setDataExtractionPath(data.dataExtractionPath || "");
        setAutoSync(data.autoSync ?? true);
      }
    } catch {
      // not configured
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadApi();
  }, []);

  const handleTest = async () => {
    if (!apiUrl.trim()) {
      toast({
        title: lang === "ar" ? "يرجى إدخال الرابط" : "Enter API URL",
        variant: "destructive",
      });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await customFetch<{
        ok: boolean;
        error?: string;
        totalItems?: number;
        samplePreview?: string;
      }>("/api/client/rest-api/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiUrl: apiUrl.trim(),
          httpMethod,
          headerName: headerName.trim() || undefined,
          headerValue: headerValue.trim() || undefined,
          dataExtractionPath: dataExtractionPath.trim() || undefined,
        }),
      });

      setTestResult(res);

      if (res.ok) {
        setShowPreview(true);
        toast({
          title: lang === "ar" ? "الاتصال ناجح ✓" : "Connection successful ✓",
          description:
            lang === "ar"
              ? `تم استخراج ${res.totalItems ?? 0} عنصر بنجاح.`
              : `Successfully extracted ${res.totalItems ?? 0} items.`,
        });
      } else {
        toast({
          title: lang === "ar" ? "فشل الاتصال" : "Connection failed",
          description: res.error || (lang === "ar" ? "تعذر جلب البيانات" : "Could not fetch data"),
          variant: "destructive",
        });
      }
    } catch (e: any) {
      toast({
        title: lang === "ar" ? "فشل الاختبار" : "Test failed",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!apiUrl.trim()) {
      toast({
        title: lang === "ar" ? "يرجى إدخال رابط الـ API" : "Enter REST API URL",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const saved = await customFetch<any>("/api/client/rest-api", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiUrl: apiUrl.trim(),
          httpMethod,
          headerName: headerName.trim() || undefined,
          headerValue: headerValue.trim() || undefined,
          dataExtractionPath: dataExtractionPath.trim() || undefined,
          autoSync,
        }),
      });
      setApiData(saved);
      setHeaderValue("");
      toast({
        title: lang === "ar" ? "تم حفظ إعدادات REST API ✓" : "REST API settings saved ✓",
        description: lang === "ar" ? "جاري المزامنة في الخلفية..." : "Background sync started...",
      });
      setTimeout(() => loadApi(), 4000);
    } catch (e: any) {
      toast({
        title: lang === "ar" ? "فشل الحفظ" : "Save failed",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await customFetch<{ ok: boolean; integration: any }>("/api/client/rest-api/sync", {
        method: "POST",
      });
      if (res.integration) setApiData(res.integration);
      toast({
        title: res.ok ? (lang === "ar" ? "اكتملت المزامنة" : "Sync complete") : (lang === "ar" ? "فشلت المزامنة" : "Sync failed"),
        description: res.ok
          ? (lang === "ar" ? `تمت مزامنة ${res.integration?.totalItems ?? 0} عنصر.` : `Synced ${res.integration?.totalItems ?? 0} items.`)
          : res.integration?.errorMessage,
        variant: res.ok ? "default" : "destructive",
      });
    } catch {
      toast({
        title: lang === "ar" ? "فشلت المزامنة" : "Sync failed",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(lang === "ar" ? "هل أنت متأكد من حذف تكوين REST API؟" : "Are you sure you want to delete this REST API integration?")) {
      return;
    }
    setDeleting(true);
    try {
      await customFetch("/api/client/rest-api", { method: "DELETE" });
      setApiData(null);
      setApiUrl("");
      setHeaderName("");
      setHeaderValue("");
      setDataExtractionPath("");
      setTestResult(null);
      toast({
        title: lang === "ar" ? "تم حذف الربط بنجاح" : "Integration removed",
      });
    } catch (e: any) {
      toast({
        title: lang === "ar" ? "فشل الحذف" : "Delete failed",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card className="bg-card border border-[#DCE7FF] dark:border-slate-800 rounded-2xl shadow-md shadow-[#2D5BE3]/15 hover:shadow-lg hover:shadow-[#2D5BE3]/25 transition-all overflow-hidden border-l-4 border-l-[#2D5BE3]">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Code2 className="w-5 h-5 text-indigo-500" />
            {t("data_source_rest_api")}
          </CardTitle>
          {apiData && (
            <Badge
              variant="outline"
              className={
                apiData.status === "connected"
                  ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                  : apiData.status === "error"
                  ? "bg-destructive/10 text-destructive border-destructive/20"
                  : "bg-amber-500/10 text-amber-600 border-amber-500/20"
              }
            >
              {apiData.status === "connected"
                ? (lang === "ar" ? "متصل ومفعل" : "Connected")
                : apiData.status === "error"
                ? (lang === "ar" ? "خطأ في المزامنة" : "Sync Error")
                : (lang === "ar" ? "قيد المزامنة" : "Pending")}
            </Badge>
          )}
        </div>
        <CardDescription>{t("data_source_rest_api_desc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : (
          <>
            {/* API Endpoint & Method */}
            <div className="space-y-2">
              <label className="text-xs font-medium">
                {lang === "ar" ? "رابط واجهة الـ API (REST Endpoint)" : "REST API Endpoint URL"}
              </label>
              <div className="flex gap-2">
                <div className="w-28 shrink-0">
                  <Select value={httpMethod} onValueChange={(v) => setHttpMethod(v as "GET" | "POST")}>
                    <SelectTrigger className="bg-background font-mono text-xs font-bold">
                      <SelectValue placeholder="GET" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="GET">GET</SelectItem>
                      <SelectItem value="POST">POST</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Input
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  placeholder="https://example.com/api/v1/products"
                  className="bg-background font-mono text-sm flex-1"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                {lang === "ar"
                  ? "أدخل رابط الـ REST API الذي يعيد بيانات JSON (مثل قائمة المنتجات، الخدمات، أو المقالات)."
                  : "Enter the REST API endpoint that returns JSON data (e.g., product catalog, services, or articles)."}
              </p>
            </div>

            {/* Optional Authentication Headers */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">
                  {lang === "ar" ? "اسم ترويسة التوثيق (اختياري)" : "Auth Header Name (Optional)"}
                </label>
                <Input
                  value={headerName}
                  onChange={(e) => setHeaderName(e.target.value)}
                  placeholder="Authorization أو X-API-Key"
                  className="bg-background font-mono text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">
                  {lang === "ar" ? "قيمة الترويسة / التوكن (اختياري)" : "Header Value / Token (Optional)"}
                </label>
                <PasswordInput
                  value={headerValue}
                  onChange={(e) => setHeaderValue(e.target.value)}
                  placeholder={apiData?.hasHeaderValue ? (lang === "ar" ? "•••••••••••• (محفوظ)" : "•••••••••••• (Saved)") : "Bearer my_secret_token..."}
                  className="bg-background text-xs"
                />
              </div>
            </div>

            {/* Nested Data Path */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium">
                {lang === "ar" ? "مسار استخراج المصفوفة داخل الـ JSON (اختياري)" : "Target Data Extraction Path (Optional)"}
              </label>
              <Input
                value={dataExtractionPath}
                onChange={(e) => setDataExtractionPath(e.target.value)}
                placeholder="data.items أو products أو result"
                className="bg-background font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                {lang === "ar"
                  ? "إذا كان رد الـ API يحتوي على مصفوفة متداخلة (مثل { data: { items: [...] } })، حدد المسار هنا. اتركه فارغاً إذا كان الرد مصفوفة مباشرة أو ترغب باستكشافه تلقائياً."
                  : "If items are inside a nested object (e.g. { data: { items: [...] } }), specify the path. Leave blank to auto-detect."}
              </p>
            </div>

            {/* Auto-Sync Switch */}
            <div className="flex items-center justify-between rounded-lg border border-[#DCE7FF] p-3 bg-muted/20">
              <div>
                <p className="text-xs font-medium">
                  {lang === "ar" ? "المزامنة التلقائية الدورية" : "Auto-Sync API Content"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {lang === "ar" ? "تحديث المعرفة من الـ API تلقائياً كل 6 ساعات" : "Re-fetch and update knowledge every 6 hours"}
                </p>
              </div>
              <Switch checked={autoSync} onCheckedChange={setAutoSync} />
            </div>

            {/* Live Test Result Banner */}
            {testResult && (
              <div
                className={`p-3 rounded-lg border text-xs space-y-2 ${
                  testResult.ok
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-950 dark:text-emerald-100"
                    : "bg-destructive/10 border-destructive/20 text-destructive"
                }`}
              >
                <div className="flex items-center justify-between font-medium">
                  <div className="flex items-center gap-1.5">
                    {testResult.ok ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
                    )}
                    <span>
                      {testResult.ok
                        ? (lang === "ar"
                            ? `تم الاتصال بنجاح! تم استخراج ${testResult.totalItems ?? 0} عنصر.`
                            : `Connection successful! Extracted ${testResult.totalItems ?? 0} items.`)
                        : testResult.error || (lang === "ar" ? "فشل الاتصال" : "Connection failed")}
                    </span>
                  </div>
                  {testResult.samplePreview && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowPreview((p) => !p)}
                      className="h-6 text-[11px] gap-1 px-2"
                    >
                      {showPreview ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      {showPreview ? (lang === "ar" ? "إخفاء" : "Hide") : (lang === "ar" ? "معاينة" : "Preview")}
                    </Button>
                  )}
                </div>

                {showPreview && testResult.samplePreview && (
                  <pre className="p-2.5 rounded bg-background/80 border border-border/40 font-mono text-[11px] max-h-48 overflow-y-auto whitespace-pre-wrap text-foreground">
                    {testResult.samplePreview}
                  </pre>
                )}
              </div>
            )}

            {/* Persistent Integration Status Summary */}
            {apiData && !testResult && (
              <div className="flex flex-col gap-2 bg-muted/30 p-3 rounded-lg border border-[#DCE7FF] text-xs">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-muted-foreground">
                    {lang === "ar" ? "الحالة: " : "Status: "}
                    <strong
                      className={
                        apiData.status === "connected"
                          ? "text-emerald-500"
                          : apiData.status === "error"
                          ? "text-destructive"
                          : "text-amber-500"
                      }
                    >
                      {apiData.status === "connected"
                        ? (lang === "ar" ? "متصل بنجاح" : "Connected")
                        : apiData.status === "error"
                        ? (lang === "ar" ? "خطأ في الجلب" : "Sync error")
                        : (lang === "ar" ? "قيد المزامنة" : "Pending")}
                    </strong>
                  </span>
                  {apiData.totalItems > 0 && (
                    <span className="text-muted-foreground">
                      {lang === "ar" ? `العناصر المستخرجة: ${apiData.totalItems}` : `Extracted Items: ${apiData.totalItems}`}
                    </span>
                  )}
                  {apiData.lastSynced && (
                    <span className="text-muted-foreground text-[11px]">
                      {lang === "ar" ? "آخر مزامنة: " : "Last sync: "}
                      {new Date(apiData.lastSynced).toLocaleString()}
                    </span>
                  )}
                </div>

                {apiData.errorMessage && (
                  <p className="text-destructive text-[11px] mt-1 font-mono">{apiData.errorMessage}</p>
                )}

                {apiData.samplePreview && (
                  <div className="pt-2 border-t border-border/30">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowPreview((p) => !p)}
                      className="h-6 text-[11px] gap-1 px-1 text-muted-foreground hover:text-foreground"
                    >
                      {showPreview ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      {lang === "ar" ? "معاينة البيانات المحفوظة للذكاء الاصطناعي" : "Preview Synced Knowledge"}
                    </Button>
                    {showPreview && (
                      <pre className="p-2.5 mt-2 rounded bg-background/80 border border-border/40 font-mono text-[11px] max-h-48 overflow-y-auto whitespace-pre-wrap text-foreground">
                        {apiData.samplePreview}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Actions Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/40">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleTest}
                  disabled={testing || !apiUrl}
                  className="text-xs"
                >
                  {testing ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Plug className="w-3.5 h-3.5 mr-1" />}
                  {lang === "ar" ? "اختبار الاتصال" : "Test Connection"}
                </Button>

                {apiData && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleSync}
                      disabled={syncing}
                      className="text-xs"
                    >
                      {syncing ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5 mr-1" />}
                      {lang === "ar" ? "مزامنة الآن" : "Sync Now"}
                    </Button>

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleDelete}
                      disabled={deleting}
                      className="text-xs text-destructive hover:bg-destructive/10"
                    >
                      {deleting ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 mr-1" />}
                      {lang === "ar" ? "حذف الربط" : "Disconnect"}
                    </Button>
                  </>
                )}
              </div>

              <Button
                type="button"
                size="sm"
                onClick={handleSave}
                disabled={saving || !apiUrl}
                className="text-xs ml-auto"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
                {lang === "ar" ? "حفظ وربط" : "Save & Connect"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ShopifyInlineCard() {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const [shopifyData, setShopifyData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Form inputs
  const [shopDomain, setShopDomain] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [autoSync, setAutoSync] = useState(true);

  // Live test preview
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    error?: string;
    totalItems?: number;
    shopName?: string;
    shopCurrency?: string;
    samplePreview?: string;
  } | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const loadShopify = async () => {
    try {
      setLoading(true);
      const data = await customFetch<any>("/api/client/shopify");
      setShopifyData(data);
      if (data) {
        setShopDomain(data.shopDomain || "");
        setAutoSync(data.autoSync ?? true);
      }
    } catch {
      // not configured
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadShopify();
  }, []);

  const handleTest = async () => {
    if (!shopDomain.trim()) {
      toast({
        title: lang === "ar" ? "يرجى إدخال نطاق متجر شوبيفاي" : "Enter Shopify Store Domain",
        variant: "destructive",
      });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await customFetch<{
        ok: boolean;
        error?: string;
        totalItems?: number;
        shopName?: string;
        shopCurrency?: string;
        samplePreview?: string;
      }>("/api/client/shopify/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopDomain: shopDomain.trim(),
          accessToken: accessToken.trim() || undefined,
        }),
      });

      setTestResult(res);

      if (res.ok) {
        setShowPreview(true);
        toast({
          title: lang === "ar" ? "الاتصال ناجح ✓" : "Connection successful ✓",
          description:
            lang === "ar"
              ? `تم استخراج ${res.totalItems ?? 0} منتج بنجاح من متجر ${res.shopName || shopDomain}.`
              : `Successfully extracted ${res.totalItems ?? 0} products from ${res.shopName || shopDomain}.`,
        });
      } else {
        toast({
          title: lang === "ar" ? "فشل الاتصال" : "Connection failed",
          description: res.error || (lang === "ar" ? "تعذر الاتصال بمتجر شوبيفاي" : "Could not connect to Shopify store"),
          variant: "destructive",
        });
      }
    } catch (e: any) {
      toast({
        title: lang === "ar" ? "فشل الاختبار" : "Test failed",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!shopDomain.trim()) {
      toast({
        title: lang === "ar" ? "يرجى إدخال نطاق المتجر" : "Enter Shopify Store Domain",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const saved = await customFetch<any>("/api/client/shopify", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopDomain: shopDomain.trim(),
          accessToken: accessToken.trim() || undefined,
          autoSync,
        }),
      });
      setShopifyData(saved);
      setAccessToken("");
      toast({
        title: lang === "ar" ? "تم حفظ إعدادات شوبيفاي ✓" : "Shopify settings saved ✓",
        description: lang === "ar" ? "جاري سحب المنتجات والمزامنة في الخلفية..." : "Background product sync started...",
      });
      setTimeout(() => loadShopify(), 4000);
    } catch (e: any) {
      toast({
        title: lang === "ar" ? "فشل الحفظ" : "Save failed",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await customFetch<{ ok: boolean; integration: any }>("/api/client/shopify/sync", {
        method: "POST",
      });
      if (res.integration) setShopifyData(res.integration);
      toast({
        title: res.ok ? (lang === "ar" ? "اكتملت المزامنة" : "Sync complete") : (lang === "ar" ? "فشلت المزامنة" : "Sync failed"),
        description: res.ok
          ? (lang === "ar" ? `تمت مزامنة ${res.integration?.totalItems ?? 0} منتج بنجاح.` : `Synced ${res.integration?.totalItems ?? 0} products.`)
          : res.integration?.errorMessage,
        variant: res.ok ? "default" : "destructive",
      });
    } catch {
      toast({
        title: lang === "ar" ? "فشلت المزامنة" : "Sync failed",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(lang === "ar" ? "هل أنت متأكد من حذف ربط متجر شوبيفاي؟" : "Are you sure you want to remove the Shopify integration?")) {
      return;
    }
    setDeleting(true);
    try {
      await customFetch("/api/client/shopify", { method: "DELETE" });
      setShopifyData(null);
      setShopDomain("");
      setAccessToken("");
      setTestResult(null);
      toast({
        title: lang === "ar" ? "تم حذف الربط بنجاح" : "Integration removed",
      });
    } catch (e: any) {
      toast({
        title: lang === "ar" ? "فشل الحذف" : "Delete failed",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card className="bg-card border border-[#DCE7FF] dark:border-slate-800 rounded-2xl shadow-md shadow-[#2D5BE3]/15 hover:shadow-lg hover:shadow-[#2D5BE3]/25 transition-all overflow-hidden border-l-4 border-l-[#2D5BE3]">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShoppingBag className="w-5 h-5 text-emerald-600" />
            {t("data_source_shopify")}
          </CardTitle>
          {shopifyData && (
            <Badge
              variant="outline"
              className={
                shopifyData.status === "connected"
                  ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                  : shopifyData.status === "error"
                  ? "bg-destructive/10 text-destructive border-destructive/20"
                  : "bg-amber-500/10 text-amber-600 border-amber-500/20"
              }
            >
              {shopifyData.status === "connected"
                ? (lang === "ar" ? "متصل ومفعل" : "Connected")
                : shopifyData.status === "error"
                ? (lang === "ar" ? "خطأ في المزامنة" : "Sync Error")
                : (lang === "ar" ? "قيد المزامنة" : "Pending")}
            </Badge>
          )}
        </div>
        <CardDescription>{t("data_source_shopify_desc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : (
          <>
            {/* Shopify Store Domain */}
            <div className="space-y-2">
              <label className="text-xs font-medium">
                {lang === "ar" ? "نطاق متجر شوبيفاي (Shopify Store Domain)" : "Shopify Store Domain"}
              </label>
              <Input
                value={shopDomain}
                onChange={(e) => setShopDomain(e.target.value)}
                placeholder="your-brand.myshopify.com أو yourstore.com"
                className="bg-background font-mono text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                {lang === "ar"
                  ? "أدخل نطاق متجرك الأساسي مثال: mybrand.myshopify.com أو رابط المتجر المخصص."
                  : "Enter your myshopify domain (e.g. your-store.myshopify.com) or custom domain."}
              </p>
            </div>

            {/* Admin API Access Token */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium">
                  {lang === "ar" ? "رمز الوصول الإداري (Admin API Access Token - اختياري)" : "Admin API Access Token (Optional)"}
                </label>
                <span className="text-[10px] text-muted-foreground">
                  {lang === "ar" ? "يبدأ بـ shpat_..." : "Starts with shpat_..."}
                </span>
              </div>
              <PasswordInput
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder={shopifyData?.hasAccessToken ? (lang === "ar" ? "•••••••••••• (محفوظ)" : "•••••••••••• (Saved)") : "shpat_xxxxxxxxxxxxxxxxxxxx"}
                className="bg-background font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                {lang === "ar"
                  ? "اختياري إذا كان متجرك متاحاً للعامة، وموصى به لمزامنة المنتجات المخفية والأسعار بدقة. يمكنك استخراجه من لوحة تحكم شوبيفاي > Apps > Develop Apps بتصريح read_products."
                  : "Optional for public storefronts. Recommended for full catalog access. Create a Custom App in Shopify Admin > Develop Apps with 'read_products' scope."}
              </p>
            </div>

            {/* Auto-Sync Switch */}
            <div className="flex items-center justify-between rounded-lg border border-[#DCE7FF] p-3 bg-muted/20">
              <div>
                <p className="text-xs font-medium">
                  {lang === "ar" ? "المزامنة التلقائية الدورية لمنتجات المتجر" : "Auto-Sync Shopify Products"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {lang === "ar" ? "تحديث المنتجات والأسعار والمخزون تلقائياً كل 6 ساعات" : "Re-sync products, pricing, and stock automatically every 6 hours"}
                </p>
              </div>
              <Switch checked={autoSync} onCheckedChange={setAutoSync} />
            </div>

            {/* Live Test Result Banner */}
            {testResult && (
              <div
                className={`p-3 rounded-lg border text-xs space-y-2 ${
                  testResult.ok
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-950 dark:text-emerald-100"
                    : "bg-destructive/10 border-destructive/20 text-destructive"
                }`}
              >
                <div className="flex items-center justify-between font-medium">
                  <div className="flex items-center gap-1.5">
                    {testResult.ok ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
                    )}
                    <span>
                      {testResult.ok
                        ? (lang === "ar"
                            ? `تم الاتصال بنجاح بمتجر ${testResult.shopName || shopDomain}! تم العثور على ${testResult.totalItems ?? 0} منتج.`
                            : `Connected to ${testResult.shopName || shopDomain}! Extracted ${testResult.totalItems ?? 0} products.`)
                        : testResult.error || (lang === "ar" ? "فشل الاتصال" : "Connection failed")}
                    </span>
                  </div>
                  {testResult.samplePreview && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowPreview((p) => !p)}
                      className="h-6 text-[11px] gap-1 px-2"
                    >
                      {showPreview ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      {showPreview ? (lang === "ar" ? "إخفاء" : "Hide") : (lang === "ar" ? "معاينة" : "Preview")}
                    </Button>
                  )}
                </div>

                {showPreview && testResult.samplePreview && (
                  <pre className="p-2.5 rounded bg-background/80 border border-border/40 font-mono text-[11px] max-h-48 overflow-y-auto whitespace-pre-wrap text-foreground">
                    {testResult.samplePreview}
                  </pre>
                )}
              </div>
            )}

            {/* Persistent Integration Status Summary */}
            {shopifyData && !testResult && (
              <div className="flex flex-col gap-2 bg-muted/30 p-3 rounded-lg border border-[#DCE7FF] text-xs">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-muted-foreground">
                    {lang === "ar" ? "الحالة: " : "Status: "}
                    <strong
                      className={
                        shopifyData.status === "connected"
                          ? "text-emerald-500"
                          : shopifyData.status === "error"
                          ? "text-destructive"
                          : "text-amber-500"
                      }
                    >
                      {shopifyData.status === "connected"
                        ? (lang === "ar" ? "متصل بنجاح" : "Connected")
                        : shopifyData.status === "error"
                        ? (lang === "ar" ? "خطأ في الجلب" : "Sync error")
                        : (lang === "ar" ? "قيد المزامنة" : "Pending")}
                    </strong>
                  </span>
                  {shopifyData.shopName && (
                    <span className="text-muted-foreground font-medium">
                      {lang === "ar" ? "المتجر: " : "Store: "} {shopifyData.shopName}
                    </span>
                  )}
                  {shopifyData.totalItems > 0 && (
                    <span className="text-muted-foreground">
                      {lang === "ar" ? `المنتجات المتزامنة: ${shopifyData.totalItems}` : `Synced Products: ${shopifyData.totalItems}`}
                    </span>
                  )}
                  {shopifyData.lastSynced && (
                    <span className="text-muted-foreground text-[11px]">
                      {lang === "ar" ? "آخر مزامنة: " : "Last sync: "}
                      {new Date(shopifyData.lastSynced).toLocaleString()}
                    </span>
                  )}
                </div>

                {shopifyData.errorMessage && (
                  <p className="text-destructive text-[11px] mt-1 font-mono">{shopifyData.errorMessage}</p>
                )}

                {shopifyData.samplePreview && (
                  <div className="pt-2 border-t border-border/30">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowPreview((p) => !p)}
                      className="h-6 text-[11px] gap-1 px-1 text-muted-foreground hover:text-foreground"
                    >
                      {showPreview ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      {lang === "ar" ? "معاينة كتالوج المنتجات المحفوظة للذكاء الاصطناعي" : "Preview Synced Products"}
                    </Button>
                    {showPreview && (
                      <pre className="p-2.5 mt-2 rounded bg-background/80 border border-border/40 font-mono text-[11px] max-h-48 overflow-y-auto whitespace-pre-wrap text-foreground">
                        {shopifyData.samplePreview}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Actions Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/40">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleTest}
                  disabled={testing || !shopDomain}
                  className="text-xs"
                >
                  {testing ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Plug className="w-3.5 h-3.5 mr-1" />}
                  {lang === "ar" ? "اختبار الاتصال" : "Test Connection"}
                </Button>

                {shopifyData && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleSync}
                      disabled={syncing}
                      className="text-xs"
                    >
                      {syncing ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5 mr-1" />}
                      {lang === "ar" ? "مزامنة الآن" : "Sync Now"}
                    </Button>

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleDelete}
                      disabled={deleting}
                      className="text-xs text-destructive hover:bg-destructive/10"
                    >
                      {deleting ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 mr-1" />}
                      {lang === "ar" ? "حذف الربط" : "Disconnect"}
                    </Button>
                  </>
                )}
              </div>

              <Button
                type="button"
                size="sm"
                onClick={handleSave}
                disabled={saving || !shopDomain}
                className="text-xs ml-auto"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
                {lang === "ar" ? "حفظ وربط" : "Save & Connect"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}


function LockedSourceCard({ title, icon: Icon }: { title: string; icon: React.ElementType }) {
  const { t } = useLanguage();

  return (
    <Card className="bg-card border border-amber-500/30 rounded-2xl shadow-sm relative overflow-hidden">
      <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-r from-amber-500/40 via-amber-500 to-amber-500/40" />
      <CardHeader className="pb-4 text-center">
        <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center mx-auto mb-3 shadow-sm">
          <Lock className="w-7 h-7" />
        </div>
        <CardTitle className="text-xl font-bold flex items-center justify-center gap-2">
          {t("data_source_locked_title")}
        </CardTitle>
        <CardDescription className="max-w-md mx-auto text-sm mt-2 leading-relaxed">
          {t("data_source_locked_desc")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center pb-8 gap-4">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted text-xs text-muted-foreground font-medium">
          <Icon className="w-4 h-4 text-primary" />
          <span>{title}</span>
          <Badge variant="outline" className="border-amber-500/40 text-amber-600 dark:text-amber-400 text-[10px] ml-1">
            {t("data_source_locked_badge")}
          </Badge>
        </div>
        <Button asChild className="gap-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white shadow">
          <Link href="/client/support">
            {t("btn_contact_support")}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

const websiteFormSchema = z.object({
  websiteDataUrl: z.string().optional().or(z.literal("")),
  websiteAutoSync: z.boolean().default(false),
});

export default function ClientKnowledge() {
  const { t, lang } = useLanguage();
  const getInitialSource = (): "website" | "files" | "wordpress" | "restapi" | "shopify" => {
    try {
      const params = new URLSearchParams(window.location.search);
      const s = (params.get("source") || params.get("tab"))?.toLowerCase();
      if (s && ["website", "files", "wordpress", "restapi", "shopify"].includes(s)) {
        return s as "website" | "files" | "wordpress" | "restapi" | "shopify";
      }
    } catch {}
    return "website";
  };
  const [activeSource, setActiveSource] = useState<"website" | "files" | "wordpress" | "restapi" | "shopify">(getInitialSource);
  
  const { data: company, isLoading: companyLoading } = useGetClientCompany({
    query: {
      queryKey: getGetClientCompanyQueryKey(),
      staleTime: 0,
      gcTime: 0,
      refetchOnMount: "always",
      refetchOnWindowFocus: true,
      refetchInterval: 3000,
    },
  });
  
  const { data: files } = useListClientKnowledgeFiles();
  const readyFilesCount = files?.filter((f) => f.status === "ready").length ?? 0;
  
  const updateCompany = useUpdateClientCompany();
  const { toast } = useToast();

  const [urlList, setUrlList] = useState<string[]>([""]);

  const form = useForm<z.infer<typeof websiteFormSchema>>({
    resolver: zodResolver(websiteFormSchema),
    defaultValues: {
      websiteDataUrl: "",
      websiteAutoSync: false,
    },
  });

  useEffect(() => {
    if (company) {
      const initialUrls = company.websiteDataUrl
        ? company.websiteDataUrl.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean)
        : [];
      setUrlList(initialUrls.length > 0 ? initialUrls : [""]);
      form.reset({
        websiteDataUrl: company.websiteDataUrl || "",
        websiteAutoSync: company.websiteAutoSync || false,
      });
    }
  }, [company, form]);

  const onWebsiteSave = async (data: z.infer<typeof websiteFormSchema>) => {
    if (!company) return;

    // Validate URLs
    const validUrls: string[] = [];
    for (const u of urlList) {
      const trimmed = u.trim();
      if (!trimmed) continue;
      try {
        const parsed = new URL(trimmed);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          toast({
            title: lang === "ar" ? "رابط غير صالح" : "Invalid URL",
            description: lang === "ar" ? `الرابط "${trimmed}" غير صالح. يجب أن يبدأ بـ http:// أو https://` : `URL "${trimmed}" must start with http:// or https://`,
            variant: "destructive",
          });
          return;
        }
        validUrls.push(trimmed);
      } catch {
        toast({
          title: lang === "ar" ? "رابط غير صالح" : "Invalid URL",
          description: lang === "ar" ? `الرابط "${trimmed}" غير صالح` : `Invalid URL "${trimmed}"`,
          variant: "destructive",
        });
        return;
      }
    }

    const combinedUrl = validUrls.join("\n");

    try {
      await updateCompany.mutateAsync({
        data: {
          ...company,
          websiteDataUrl: combinedUrl || null,
          websiteAutoSync: data.websiteAutoSync,
        } as any,
      });
      toast({ title: lang === "ar" ? "تم حفظ إعدادات الموقع" : "Website settings saved" });
    } catch (err: any) {
      toast({ title: lang === "ar" ? "فشل الحفظ" : "Save failed", description: err.message, variant: "destructive" });
    }
  };

  const websiteUrl = form.watch("websiteDataUrl");

  const allowWebsite = (company as any)?.allowSourceWebsite === false ? false : true;
  const allowFiles = (company as any)?.allowSourceFiles === false ? false : true;
  const allowWordpress = (company as any)?.allowSourceWordpress === false ? false : true;
  const allowRestApi = (company as any)?.allowSourceRestApi === false ? false : true;
  const allowShopify = (company as any)?.allowSourceShopify === false ? false : true;

  // Sync activeSource with URL search params (?source=... or ?tab=...) and permissions
  useEffect(() => {
    if (!company) return;
    try {
      const params = new URLSearchParams(window.location.search);
      const s = (params.get("source") || params.get("tab"))?.toLowerCase();
      if (s && ["website", "files", "wordpress", "restapi", "shopify"].includes(s)) {
        const isRequestedAllowed =
          s === "website" ? allowWebsite :
          s === "files" ? allowFiles :
          s === "wordpress" ? allowWordpress :
          s === "restapi" ? allowRestApi :
          allowShopify;
        if (isRequestedAllowed) {
          setActiveSource(s as any);
          return;
        }
      }
    } catch {}

    // Fallback if current activeSource is not allowed
    const currentAllowed =
      activeSource === "website" ? allowWebsite :
      activeSource === "files" ? allowFiles :
      activeSource === "wordpress" ? allowWordpress :
      activeSource === "restapi" ? allowRestApi :
      allowShopify;

    if (!currentAllowed) {
      const firstAllowed = (["website", "files", "wordpress", "restapi", "shopify"] as const).find(
        (k) => (k === "website" ? allowWebsite : k === "files" ? allowFiles : k === "wordpress" ? allowWordpress : k === "restapi" ? allowRestApi : allowShopify)
      );
      if (firstAllowed) {
        setActiveSource(firstAllowed);
      }
    }
  }, [company, allowWebsite, allowFiles, allowWordpress, allowRestApi, allowShopify]);

  // Fetch WordPress status to show green dot indicator in sidebar
  const { data: wpStatus } = useQuery({
    queryKey: ["wp-status"],
    queryFn: () => customFetch<{ status?: string } | null>("/api/client/wordpress"),
    refetchInterval: 10_000,
    enabled: allowWordpress,
  });
  const isWordPressConnected = wpStatus?.status === "connected";

  // Fetch REST API status to show green dot indicator in sidebar
  const { data: restApiStatus } = useQuery({
    queryKey: ["rest-api-status"],
    queryFn: () => customFetch<{ status?: string } | null>("/api/client/rest-api"),
    refetchInterval: 10_000,
    enabled: allowRestApi,
  });
  const isRestApiConnected = restApiStatus?.status === "connected";

  // Fetch Shopify status to show green dot indicator in sidebar
  const { data: shopifyStatus } = useQuery({
    queryKey: ["shopify-status"],
    queryFn: () => customFetch<{ status?: string } | null>("/api/client/shopify"),
    refetchInterval: 10_000,
    enabled: allowShopify,
  });
  const isShopifyConnected = shopifyStatus?.status === "connected";

  if (companyLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-[400px] w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-4 sm:p-0">
      {/* Hero Operations Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 p-6 sm:p-8 text-white shadow-xl shadow-blue-500/10">
        <div className="absolute -right-10 -top-10 h-44 w-44 rounded-full bg-white/10 blur-2xl pointer-events-none" />
        <div className="absolute -left-10 -bottom-10 h-44 w-44 rounded-full bg-blue-400/20 blur-2xl pointer-events-none" />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white/15 backdrop-blur-md border border-white/25 flex items-center justify-center shadow-[inset_0_0_0_2px_rgba(255,255,255,0.18)] shrink-0">
              <i className="fa-solid fa-database text-2xl sm:text-3xl text-white"></i>
            </div>
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-white/15 border border-white/20 text-xs font-semibold tracking-wide uppercase text-blue-100 mb-1.5 backdrop-blur-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                {lang === "ar" ? "قاعدة المعرفة والتدريب الذكي" : "Knowledge Base & Vector Store"}
              </div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight drop-shadow-sm">{t("get_data_title")}</h1>
              <p className="text-blue-100 text-xs sm:text-sm mt-1 max-w-xl font-normal opacity-90">{t("get_data_desc")}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Sidebar Nav */}
        <div className="flex flex-col gap-2">
          {/* Button 1: Website URL */}
          <button
            type="button"
            onClick={() => setActiveSource("website")}
            className={`flex items-center gap-3 p-3.5 rounded-2xl border text-left transition-all ${
              activeSource === "website"
                ? !allowWebsite
                  ? "border-amber-500/50 bg-amber-500/10 shadow-sm ring-2 ring-amber-500/20"
                  : "border-blue-600 bg-blue-50/80 dark:bg-blue-950/40 shadow-sm ring-2 ring-blue-500/20 text-blue-900 dark:text-blue-100"
                : "border-[#DCE7FF] dark:border-slate-800 bg-card hover:bg-slate-50 dark:hover:bg-slate-900/60 text-slate-700 dark:text-slate-300"
            }`}
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${
              !allowWebsite
                ? "bg-amber-500/15 text-amber-500"
                : activeSource === "website"
                ? "bg-blue-600 text-white shadow-md shadow-blue-600/25"
                : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
            }`}>
              {!allowWebsite ? <Lock className="w-4 h-4" /> : <Globe className="w-4 h-4" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold truncate">{t("data_source_website")}</p>
              <p className="text-[11px] text-muted-foreground truncate">
                {!allowWebsite ? (
                  <span className="text-amber-600 dark:text-amber-400 font-semibold">{t("data_source_locked_badge")}</span>
                ) : websiteUrl ? (
                  lang === "ar" ? "تم التكوين" : "Configured"
                ) : (
                  lang === "ar" ? "سحب الويب" : "Web scraping"
                )}
              </p>
            </div>
            {!allowWebsite ? (
              <Lock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            ) : websiteUrl ? (
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0 shadow-[0_0_8px_2px_rgba(16,185,129,0.6)]" />
            ) : null}
          </button>

          {/* Button 2: Uploaded Knowledge Files */}
          <button
            type="button"
            onClick={() => setActiveSource("files")}
            className={`flex items-center gap-3 p-3.5 rounded-2xl border text-left transition-all ${
              activeSource === "files"
                ? !allowFiles
                  ? "border-amber-500/50 bg-amber-500/10 shadow-sm ring-2 ring-amber-500/20"
                  : "border-blue-600 bg-blue-50/80 dark:bg-blue-950/40 shadow-sm ring-2 ring-blue-500/20 text-blue-900 dark:text-blue-100"
                : "border-[#DCE7FF] dark:border-slate-800 bg-card hover:bg-slate-50 dark:hover:bg-slate-900/60 text-slate-700 dark:text-slate-300"
            }`}
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${
              !allowFiles
                ? "bg-amber-500/15 text-amber-500"
                : activeSource === "files"
                ? "bg-blue-600 text-white shadow-md shadow-blue-600/25"
                : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
            }`}>
              {!allowFiles ? <Lock className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold truncate">{t("data_source_files")}</p>
              <p className="text-[11px] text-muted-foreground truncate">
                {!allowFiles ? (
                  <span className="text-amber-600 dark:text-amber-400 font-semibold">{t("data_source_locked_badge")}</span>
                ) : (
                  lang === "ar" ? "Excel, CSV, PDF" : "Excel, CSV, PDF"
                )}
              </p>
            </div>
            {!allowFiles ? (
              <Lock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            ) : readyFilesCount > 0 ? (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-600 text-white shrink-0 shadow-sm">
                {readyFilesCount}
              </span>
            ) : null}
          </button>

          {/* Button 3: WordPress */}
          <button
            type="button"
            onClick={() => setActiveSource("wordpress")}
            className={`flex items-center gap-3 p-3.5 rounded-2xl border text-left transition-all ${
              activeSource === "wordpress"
                ? !allowWordpress
                  ? "border-amber-500/50 bg-amber-500/10 shadow-sm ring-2 ring-amber-500/20"
                  : "border-blue-600 bg-blue-50/80 dark:bg-blue-950/40 shadow-sm ring-2 ring-blue-500/20 text-blue-900 dark:text-blue-100"
                : "border-[#DCE7FF] dark:border-slate-800 bg-card hover:bg-slate-50 dark:hover:bg-slate-900/60 text-slate-700 dark:text-slate-300"
            }`}
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${
              !allowWordpress
                ? "bg-amber-500/15 text-amber-500"
                : activeSource === "wordpress"
                ? "bg-blue-600 text-white shadow-md shadow-blue-600/25"
                : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
            }`}>
              {!allowWordpress ? <Lock className="w-4 h-4" /> : <Plug className="w-4 h-4" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold truncate">{t("data_source_wordpress")}</p>
              <p className="text-[11px] text-muted-foreground truncate">
                {!allowWordpress ? (
                  <span className="text-amber-600 dark:text-amber-400 font-semibold">{t("data_source_locked_badge")}</span>
                ) : isWordPressConnected ? (
                  lang === "ar" ? "متصل" : "Connected"
                ) : (
                  lang === "ar" ? "المقالات والمنتجات" : "REST API Sync"
                )}
              </p>
            </div>
            {!allowWordpress ? (
              <Lock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            ) : isWordPressConnected ? (
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0 shadow-[0_0_8px_2px_rgba(16,185,129,0.6)]" />
            ) : null}
          </button>

          {/* Button 4: REST API */}
          <button
            type="button"
            onClick={() => setActiveSource("restapi")}
            className={`flex items-center gap-3 p-3.5 rounded-2xl border text-left transition-all ${
              activeSource === "restapi"
                ? !allowRestApi
                  ? "border-amber-500/50 bg-amber-500/10 shadow-sm ring-2 ring-amber-500/20"
                  : "border-blue-600 bg-blue-50/80 dark:bg-blue-950/40 shadow-sm ring-2 ring-blue-500/20 text-blue-900 dark:text-blue-100"
                : "border-[#DCE7FF] dark:border-slate-800 bg-card hover:bg-slate-50 dark:hover:bg-slate-900/60 text-slate-700 dark:text-slate-300"
            }`}
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${
              !allowRestApi
                ? "bg-amber-500/15 text-amber-500"
                : activeSource === "restapi"
                ? "bg-blue-600 text-white shadow-md shadow-blue-600/25"
                : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
            }`}>
              {!allowRestApi ? <Lock className="w-4 h-4" /> : <Code2 className="w-4 h-4" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold truncate">{t("data_source_rest_api")}</p>
              <p className="text-[11px] text-muted-foreground truncate">
                {!allowRestApi ? (
                  <span className="text-amber-600 dark:text-amber-400 font-semibold">{t("data_source_locked_badge")}</span>
                ) : isRestApiConnected ? (
                  lang === "ar" ? "متصل" : "Connected"
                ) : (
                  lang === "ar" ? "واجهة برمجية JSON" : "Custom JSON API"
                )}
              </p>
            </div>
            {!allowRestApi ? (
              <Lock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            ) : isRestApiConnected ? (
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0 shadow-[0_0_8px_2px_rgba(16,185,129,0.6)]" />
            ) : null}
          </button>

          {/* Button 5: Shopify */}
          <button
            type="button"
            onClick={() => setActiveSource("shopify")}
            className={`flex items-center gap-3 p-3.5 rounded-2xl border text-left transition-all ${
              activeSource === "shopify"
                ? !allowShopify
                  ? "border-amber-500/50 bg-amber-500/10 shadow-sm ring-2 ring-amber-500/20"
                  : "border-blue-600 bg-blue-50/80 dark:bg-blue-950/40 shadow-sm ring-2 ring-blue-500/20 text-blue-900 dark:text-blue-100"
                : "border-[#DCE7FF] dark:border-slate-800 bg-card hover:bg-slate-50 dark:hover:bg-slate-900/60 text-slate-700 dark:text-slate-300"
            }`}
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${
              !allowShopify
                ? "bg-amber-500/15 text-amber-500"
                : activeSource === "shopify"
                ? "bg-blue-600 text-white shadow-md shadow-blue-600/25"
                : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
            }`}>
              {!allowShopify ? <Lock className="w-4 h-4" /> : <ShoppingBag className="w-4 h-4" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold truncate">{t("data_source_shopify")}</p>
              <p className="text-[11px] text-muted-foreground truncate">
                {!allowShopify ? (
                  <span className="text-amber-600 dark:text-amber-400 font-semibold">{t("data_source_locked_badge")}</span>
                ) : isShopifyConnected ? (
                  lang === "ar" ? "متصل" : "Connected"
                ) : (
                  lang === "ar" ? "المنتجات والأسعار" : "Products & Catalog"
                )}
              </p>
            </div>
            {!allowShopify ? (
              <Lock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            ) : isShopifyConnected ? (
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0 shadow-[0_0_8px_2px_rgba(16,185,129,0.6)]" />
            ) : null}
          </button>
        </div>

        {/* Content Area */}
        <div className="md:col-span-3">
          {activeSource === "website" && (
            !allowWebsite ? (
              <LockedSourceCard title={t("data_source_website")} icon={Globe} />
            ) : (
              <Card className="bg-card border border-[#DCE7FF] dark:border-slate-800 rounded-2xl shadow-md shadow-[#2D5BE3]/15 hover:shadow-lg hover:shadow-[#2D5BE3]/25 transition-all overflow-hidden border-l-4 border-l-[#2D5BE3]">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Globe className="w-5 h-5 text-primary" />
                    {t("data_source_website")}
                  </CardTitle>
                  <CardDescription>{t("data_source_website_desc")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onWebsiteSave)} className="space-y-4">
                      <FormField
                        control={form.control}
                        name="websiteDataUrl"
                        render={() => (
                          <FormItem className="space-y-3">
                            <div className="flex items-center justify-between">
                              <FormLabel className="text-sm font-semibold">{t("company_website_url")}</FormLabel>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setUrlList(prev => [...prev, ""])}
                                className="h-8 px-2.5 text-xs flex items-center gap-1.5 border-primary/30 text-primary hover:bg-primary/10 hover:border-primary transition-all rounded-lg"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>{lang === "ar" ? "إضافة رابط آخر (+)" : "Add URL (+)"}</span>
                              </Button>
                            </div>

                            <div className="space-y-2">
                              {urlList.map((url, idx) => (
                                <div key={idx} className="flex items-center gap-2">
                                  <div className="relative flex-1">
                                    <Input
                                      value={url}
                                      onChange={(e) => {
                                        const next = [...urlList];
                                        next[idx] = e.target.value;
                                        setUrlList(next);
                                        form.setValue("websiteDataUrl", next.filter(Boolean).join("\n"));
                                      }}
                                      className="bg-background pr-8"
                                      placeholder={idx === 0 ? "https://www.noor-book.com/" : "https://www.example.com/page"}
                                    />
                                    {urlList.length > 1 && (
                                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/60 font-mono pointer-events-none">
                                        #{idx + 1}
                                      </span>
                                    )}
                                  </div>
                                  {urlList.length > 1 && (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => {
                                        const next = urlList.filter((_, i) => i !== idx);
                                        const updated = next.length > 0 ? next : [""];
                                        setUrlList(updated);
                                        form.setValue("websiteDataUrl", updated.filter(Boolean).join("\n"));
                                      }}
                                      className="h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg shrink-0 transition-colors"
                                      title={lang === "ar" ? "حذف الرابط" : "Remove URL"}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  )}
                                </div>
                              ))}
                            </div>

                            <FormDescription>
                              {t("company_website_url_desc")}
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="websiteAutoSync"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start gap-3 rounded-lg border border-[#DCE7FF] p-4 bg-muted/20">
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                disabled={!urlList.some(u => u.trim())}
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel className="cursor-pointer">{t("company_website_autosync")}</FormLabel>
                              <FormDescription>
                                {t("company_website_autosync_desc")}
                                {company?.websiteLastSynced && (
                                  <span className="block mt-1 text-primary text-[11px]">
                                    {lang === "ar" ? "آخر مزامنة: " : "Last synced: "} {new Date(company.websiteLastSynced).toLocaleString()}
                                  </span>
                                )}
                              </FormDescription>
                            </div>
                          </FormItem>
                        )}
                      />
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/40">
                        {company?.websiteDataUrl && (
                          <WebsiteSyncButton companyWebsiteLastSynced={company.websiteLastSynced ?? null} />
                        )}
                        <Button type="submit" disabled={updateCompany.isPending} className="ml-auto bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md shadow-blue-600/25 px-6 py-2">
                          {updateCompany.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                          {lang === "ar" ? "حفظ التغييرات" : "Save Changes"}
                        </Button>
                      </div>
                    </form>
                  </Form>
                </CardContent>
              </Card>
            )
          )}

          {activeSource === "files" && (
            !allowFiles ? (
              <LockedSourceCard title={t("data_source_files")} icon={FileText} />
            ) : (
              <KnowledgeFilesCard />
            )
          )}

          {activeSource === "wordpress" && (
            !allowWordpress ? (
              <LockedSourceCard title={t("data_source_wordpress")} icon={Plug} />
            ) : (
              <WordPressInlineCard />
            )
          )}

          {activeSource === "restapi" && (
            !allowRestApi ? (
              <LockedSourceCard title={t("data_source_rest_api")} icon={Code2} />
            ) : (
              <RestApiInlineCard />
            )
          )}

          {activeSource === "shopify" && (
            !allowShopify ? (
              <LockedSourceCard title={t("data_source_shopify")} icon={ShoppingBag} />
            ) : (
              <ShopifyInlineCard />
            )
          )}
        </div>
      </div>
    </div>
  );
}
