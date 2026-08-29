import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Globe, FileText, Plug, Database, Sparkles, ChevronDown, Loader2, RotateCcw, Upload, Trash2, Link2, FileSpreadsheet, FileJson, Sheet as SheetIcon, ExternalLink } from "lucide-react";
import { Link } from "wouter";
import {
  useGetClientCompany, useUpdateClientCompany,
  useListClientKnowledgeFiles, useCreateClientKnowledgeFile, useDeleteClientKnowledgeFile,
  getGetClientCompanyQueryKey, getListClientKnowledgeFilesQueryKey, customFetch,
} from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/hooks/use-language";
import { useToast } from "@/hooks/use-toast";

import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";


const FILE_TYPE_ICON: Record<string, typeof FileText> = {
  pdf: FileText,
  excel: SheetIcon,
  csv: FileSpreadsheet,
  json: FileJson,
  google_sheet: SheetIcon,
};

const FILE_TYPE_LABEL: Record<string, string> = {
  pdf: "PDF",
  excel: "Excel",
  csv: "CSV",
  json: "JSON",
  google_sheet: "Google Sheet",
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

  return (
    <Card className="bg-card border-border/50">
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
            accept=".pdf,.xlsx,.xls,.csv,.json"
            className="hidden"
            onChange={(e) => {
              handleFilesSelected(e.target.files);
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingCount > 0}
          >
            {uploadingCount > 0 ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {lang === "ar" ? "جاري الرفع..." : "Uploading…"}</>
            ) : (
              <><Upload className="w-4 h-4 mr-2" /> {lang === "ar" ? "رفع ملفات" : "Upload Files"}</>
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

        <div className="rounded-lg border border-border/60 divide-y divide-border/40">
          {isLoading ? (
            <div className="p-4"><Skeleton className="h-10 w-full" /></div>
          ) : !files || files.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">{lang === "ar" ? "لا توجد ملفات معرفة مضافة بعد." : "No knowledge files yet."}</div>
          ) : (
            files.map((file) => {
              const Icon = FILE_TYPE_ICON[file.fileType] ?? FileText;
              return (
                <div key={file.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{file.fileName}</p>
                      <p className="text-xs text-muted-foreground">
                        {FILE_TYPE_LABEL[file.fileType] ?? file.fileType}
                        {file.sourceUrl ? ` · ${file.sourceUrl}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {file.status === "processing" && (
                      <span className="text-xs flex items-center gap-1 text-amber-600"><Loader2 className="w-3 h-3 animate-spin" /> {lang === "ar" ? "جاري المعالجة" : "Processing"}</span>
                    )}
                    {file.status === "ready" && (
                      <span className="text-xs text-emerald-600">✓ {lang === "ar" ? "جاهز" : "Ready"}</span>
                    )}
                    {file.status === "error" && (
                      <span className="text-xs text-red-600">✗ {lang === "ar" ? "خطأ" : "Error"}</span>
                    )}
                    <Button type="button" variant="ghost" size="icon" onClick={() => handleDelete(file.id)} disabled={deleteFile.isPending}>
                      <Trash2 className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              );
            })
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

  const handleTest = async () => {
    if (!apiUrl) {
      toast({ title: lang === "ar" ? "يرجى إدخال الرابط" : "Enter API URL", variant: "destructive" });
      return;
    }
    setTesting(true);
    try {
      const res = await customFetch<{ ok: boolean; error?: string; siteName?: string }>("/api/client/wordpress/test", {
        method: "POST",
        body: JSON.stringify({ apiUrl, username: username || undefined, appPassword: appPassword || undefined }),
      });
      if (res.ok) {
        toast({ title: lang === "ar" ? "الاتصال ناجح" : "Connection successful", description: res.siteName ? `${res.siteName}` : "WordPress API is reachable" });
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
    if (!apiUrl) {
      toast({ title: lang === "ar" ? "يرجى إدخال رابط ووردبريس" : "Enter WordPress API URL", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const saved = await customFetch<any>("/api/client/wordpress", {
        method: "PUT",
        body: JSON.stringify({
          apiUrl,
          username: username || undefined,
          appPassword: appPassword || undefined,
          autoSync,
        }),
      });
      setWpData(saved);
      setAppPassword("");
      toast({ title: lang === "ar" ? "تم حفظ إعدادات ووردبريس" : "WordPress settings saved" });
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
    <Card className="bg-card border-border/50 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="w-5 h-5 text-blue-500" />
            {t("data_source_wordpress")}
          </CardTitle>
          <Link href="/client/wordpress">
            <Button variant="ghost" size="sm" className="text-xs text-primary gap-1">
              {lang === "ar" ? "الإعدادات المتقدمة" : "Advanced Settings"}
              <ExternalLink className="w-3 h-3" />
            </Button>
          </Link>
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
              <p className="text-[11px] text-muted-foreground">{lang === "ar" ? "مثال: https://myblog.com/wp-json/" : "Example: https://myblog.com/wp-json/"}</p>
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

            <div className="flex items-center justify-between rounded-lg border border-border/50 p-3 bg-muted/20">
              <div>
                <p className="text-xs font-medium">{lang === "ar" ? "المزامنة التلقائية الدورية" : "Auto-Sync WordPress Content"}</p>
                <p className="text-[11px] text-muted-foreground">{lang === "ar" ? "مزامنة المقالات والصفحات كل 6 ساعات" : "Sync posts and pages every 6 hours"}</p>
              </div>
              <Switch checked={autoSync} onCheckedChange={setAutoSync} />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/40">
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={handleTest} disabled={testing || !apiUrl} className="text-xs">
                  {testing ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Plug className="w-3.5 h-3.5 mr-1" />}
                  {lang === "ar" ? "اختبار الاتصال" : "Test Connection"}
                </Button>
                {wpData?.status === "connected" && (
                  <Button type="button" variant="outline" size="sm" onClick={handleSync} disabled={syncing} className="text-xs">
                    {syncing ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5 mr-1" />}
                    {lang === "ar" ? "مزامنة الآن" : "Sync Now"}
                  </Button>
                )}
              </div>
              <Button type="button" size="sm" onClick={handleSave} disabled={saving || !apiUrl} className="text-xs">
                {saving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
                {lang === "ar" ? "حفظ وربط" : "Save & Connect"}
              </Button>
            </div>

            {wpData && (
              <div className="flex items-center justify-between text-xs bg-muted/30 p-2.5 rounded-lg border border-border/50">
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


const websiteFormSchema = z.object({
  websiteDataUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  websiteAutoSync: z.boolean().default(false),
});

export default function ClientKnowledge() {
  const { t, lang } = useLanguage();
  const [activeSource, setActiveSource] = useState<"website" | "files" | "wordpress">("website");
  
  const { data: company, isLoading: companyLoading } = useGetClientCompany({
    query: { queryKey: getGetClientCompanyQueryKey() },
  });
  
  const { data: files } = useListClientKnowledgeFiles();
  const readyFilesCount = files?.filter((f) => f.status === "ready").length ?? 0;
  
  const updateCompany = useUpdateClientCompany();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof websiteFormSchema>>({
    resolver: zodResolver(websiteFormSchema),
    defaultValues: {
      websiteDataUrl: "",
      websiteAutoSync: false,
    },
  });

  useEffect(() => {
    if (company) {
      form.reset({
        websiteDataUrl: company.websiteDataUrl || "",
        websiteAutoSync: company.websiteAutoSync || false,
      });
    }
  }, [company, form]);

  const onWebsiteSave = async (data: z.infer<typeof websiteFormSchema>) => {
    if (!company) return;
    try {
      await updateCompany.mutateAsync({ data: { ...company, ...data } as any });
      toast({ title: lang === "ar" ? "تم حفظ إعدادات الموقع" : "Website settings saved" });
    } catch (err: any) {
      toast({ title: lang === "ar" ? "فشل الحفظ" : "Save failed", description: err.message, variant: "destructive" });
    }
  };

  const websiteUrl = form.watch("websiteDataUrl");

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
      <div>
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2 text-primary">
          <Database className="w-6 h-6" />
          {t("get_data_title")}
        </h2>
        <p className="text-muted-foreground mt-1">{t("get_data_desc")}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Sidebar Nav */}
        <div className="flex flex-col gap-2">
          {/* Button 1: Website URL */}
          <button
            type="button"
            onClick={() => setActiveSource("website")}
            className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
              activeSource === "website"
                ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary/20"
                : "border-border/60 bg-card hover:bg-muted/40"
            }`}
          >
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
              activeSource === "website" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}>
              <Globe className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate">{t("data_source_website")}</p>
              <p className="text-[11px] text-muted-foreground truncate">
                {websiteUrl ? (lang === "ar" ? "تم التكوين" : "Configured") : (lang === "ar" ? "سحب الويب" : "Web scraping")}
              </p>
            </div>
            {websiteUrl && <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 shadow-[0_0_6px_1px_rgba(16,185,129,0.6)]" />}
          </button>

          {/* Button 2: Uploaded Knowledge Files */}
          <button
            type="button"
            onClick={() => setActiveSource("files")}
            className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
              activeSource === "files"
                ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary/20"
                : "border-border/60 bg-card hover:bg-muted/40"
            }`}
          >
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
              activeSource === "files" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}>
              <FileText className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate">{t("data_source_files")}</p>
              <p className="text-[11px] text-muted-foreground truncate">
                {lang === "ar" ? "PDF, Excel, CSV" : "PDF, Excel, CSV"}
              </p>
            </div>
            {readyFilesCount > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/20 text-primary shrink-0">
                {readyFilesCount}
              </span>
            )}
          </button>

          {/* Button 3: WordPress */}
          <button
            type="button"
            onClick={() => setActiveSource("wordpress")}
            className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
              activeSource === "wordpress"
                ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary/20"
                : "border-border/60 bg-card hover:bg-muted/40"
            }`}
          >
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
              activeSource === "wordpress" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}>
              <Plug className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate">{t("data_source_wordpress")}</p>
              <p className="text-[11px] text-muted-foreground truncate">
                {lang === "ar" ? "المقالات والمنتجات" : "REST API Sync"}
              </p>
            </div>
          </button>
        </div>

        {/* Content Area */}
        <div className="md:col-span-3">
          {activeSource === "website" && (
            <Card className="bg-card border-border/50 shadow-sm">
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
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("company_website_url")}</FormLabel>
                          <FormControl>
                            <Input {...field} className="bg-background" placeholder="https://yoursite.com" />
                          </FormControl>
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
                        <FormItem className="flex flex-row items-start gap-3 rounded-lg border border-border/50 p-4 bg-muted/20">
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              disabled={!form.watch("websiteDataUrl")}
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
                      <Button type="submit" disabled={updateCompany.isPending} className="ml-auto">
                        {updateCompany.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                        {lang === "ar" ? "حفظ التغييرات" : "Save Changes"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </CardContent>
            </Card>
          )}

          {activeSource === "files" && (
            <KnowledgeFilesCard />
          )}

          {activeSource === "wordpress" && (
            <WordPressInlineCard />
          )}
        </div>
      </div>
    </div>
  );
}
