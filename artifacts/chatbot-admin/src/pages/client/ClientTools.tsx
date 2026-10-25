import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useLanguage } from "@/hooks/use-language";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Calendar as CalendarIcon,
  FileSpreadsheet,
  Clock,
  Globe,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  Plus,
  Video,
  Mail,
  User,
  HelpCircle,
  Sparkles,
  Wrench,
  Loader2,
  CalendarCheck2,
  TableProperties,
  ArrowRight,
  Database,
  Link as LinkIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface CalendarConfig {
  googleCalendarEnabled: boolean;
  googleCalendarId: string;
  googleCalendarTimezone: string;
  googleCalendarDuration: number;
  googleCalendarBookingRules: string;
  hasCustomKey: boolean;
  hasCompanyKey: boolean;
  serviceAccountEmail: string | null;
  credentialsSource: "custom" | "company" | "none";
}

interface SheetsConfig {
  googleSheetsEnabled: boolean;
  googleSheetsLink: string;
  googleSheetsName: string;
  googleSheetsPage: string;
  hasServiceAccountKey: boolean;
  serviceAccountEmail: string | null;
}

interface CalendarEvent {
  id: string;
  summary: string;
  description: string;
  start: string;
  end: string;
  htmlLink?: string;
  meetLink?: string;
  status?: string;
  attendees?: Array<{ email?: string; name?: string; responseStatus?: string }>;
}

const COMMON_TIMEZONES = [
  { value: "UTC", label: "UTC (Coordinated Universal Time)" },
  { value: "Africa/Cairo", label: "Africa/Cairo (UTC+2 / +3)" },
  { value: "Asia/Riyadh", label: "Asia/Riyadh (UTC+3 - Saudi Arabia)" },
  { value: "Asia/Dubai", label: "Asia/Dubai (UTC+4 - UAE)" },
  { value: "Asia/Kuwait", label: "Asia/Kuwait (UTC+3)" },
  { value: "Africa/Casablanca", label: "Africa/Casablanca (UTC+1)" },
  { value: "Europe/London", label: "Europe/London (GMT/BST)" },
  { value: "Europe/Paris", label: "Europe/Paris (CET/CEST)" },
  { value: "America/New_York", label: "America/New_York (EST/EDT)" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles (PST/PDT)" },
];

export default function ClientTools() {
  const [location, setLocation] = useLocation();
  const { lang } = useLanguage();
  const isAr = lang === "ar";
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Active tab: 'calendar' | 'sheets'
  const [activeTab, setActiveTab] = useState<"calendar" | "sheets">(() => {
    if (location.includes("sheets")) return "sheets";
    return "calendar";
  });

  useEffect(() => {
    if (location.includes("sheets")) {
      setActiveTab("sheets");
    } else if (location.includes("calendar")) {
      setActiveTab("calendar");
    }
  }, [location]);

  // ── Calendar Local State ──────────────────────────────────────────────────
  const [calendarId, setCalendarId] = useState("primary");
  const [calEnabled, setCalEnabled] = useState(false);
  const [timezone, setTimezone] = useState("UTC");
  const [duration, setDuration] = useState(30);
  const [bookingRules, setBookingRules] = useState("");
  const [calCustomKeyJson, setCalCustomKeyJson] = useState("");
  const [useCustomCalKey, setUseCustomCalKey] = useState(false);
  const [isCalFormInitialized, setIsCalFormInitialized] = useState(false);

  // New Event Modal state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [eventSummary, setEventSummary] = useState("");
  const [eventStartTime, setEventStartTime] = useState("");
  const [eventDuration, setEventDuration] = useState(30);
  const [eventEmail, setEventEmail] = useState("");
  const [eventDesc, setEventDesc] = useState("");

  // ── Sheets Local State ────────────────────────────────────────────────────
  const [sheetsEnabled, setSheetsEnabled] = useState(false);
  const [sheetsLink, setSheetsLink] = useState("");
  const [sheetsName, setSheetsName] = useState("");
  const [sheetsPage, setSheetsPage] = useState("");
  const [sheetsCustomKey, setSheetsCustomKey] = useState("");
  const [showSheetsKeyEdit, setShowSheetsKeyEdit] = useState(false);
  const [isSheetsInitialized, setIsSheetsInitialized] = useState(false);
  const [sheetsTestResult, setSheetsTestResult] = useState<{
    success: boolean;
    message: string;
    sheetTitle?: string;
    availableTabs?: string[];
  } | null>(null);

  // ── Fetch Calendar Config ────────────────────────────────────────────────
  const { data: calConfig, isLoading: loadingCalConfig } = useQuery<CalendarConfig>({
    queryKey: ["client-calendar-config"],
    queryFn: async () => {
      const res = await customFetch<CalendarConfig>("/api/client/tools/calendar/config");
      if (!isCalFormInitialized && res) {
        setCalEnabled(res.googleCalendarEnabled ?? false);
        setCalendarId(res.googleCalendarId || "primary");
        setTimezone(res.googleCalendarTimezone || "UTC");
        setDuration(res.googleCalendarDuration || 30);
        setBookingRules(res.googleCalendarBookingRules || "");
        setUseCustomCalKey(res.hasCustomKey);
        setIsCalFormInitialized(true);
      }
      return res;
    },
  });

  // ── Fetch Upcoming Calendar Events ───────────────────────────────────────
  const {
    data: eventsData,
    isLoading: loadingEvents,
    refetch: refetchEvents,
    isFetching: fetchingEvents,
  } = useQuery<{ ok: boolean; events: CalendarEvent[]; error?: string }>({
    queryKey: ["client-calendar-events"],
    queryFn: () => customFetch<{ ok: boolean; events: CalendarEvent[]; error?: string }>("/api/client/tools/calendar/events"),
    enabled: Boolean(calConfig?.googleCalendarEnabled && (calConfig?.hasCompanyKey || calConfig?.hasCustomKey)),
    retry: false,
  });

  // ── Fetch Sheets Config ──────────────────────────────────────────────────
  const { data: sheetsConfig, isLoading: loadingSheetsConfig } = useQuery<SheetsConfig>({
    queryKey: ["client-sheets-config"],
    queryFn: async () => {
      const res = await customFetch<SheetsConfig>("/api/client/tools/sheets/config");
      if (!isSheetsInitialized && res) {
        setSheetsEnabled(res.googleSheetsEnabled ?? false);
        setSheetsLink(res.googleSheetsLink || "");
        setSheetsName(res.googleSheetsName || "");
        setSheetsPage(res.googleSheetsPage || "");
        setIsSheetsInitialized(true);
      }
      return res;
    },
  });

  // ── Save Calendar Mutation ───────────────────────────────────────────────
  const saveCalMutation = useMutation({
    mutationFn: (payload: any) =>
      customFetch("/api/client/tools/calendar/config", {
        method: "PUT",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast({
        title: isAr ? "تم الحفظ بنجاح" : "Settings Saved",
        description: isAr
          ? "تم تحديث إعدادات تقويم Google بنجاح"
          : "Google Calendar configuration updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["client-calendar-config"] });
      queryClient.invalidateQueries({ queryKey: ["client-calendar-events"] });
    },
    onError: (err: any) => {
      toast({
        title: isAr ? "فشل الحفظ" : "Save Failed",
        description: err?.message || (isAr ? "حدث خطأ أثناء الحفظ" : "Error saving settings"),
        variant: "destructive",
      });
    },
  });

  // ── Test Calendar Mutation ───────────────────────────────────────────────
  const testCalMutation = useMutation({
    mutationFn: () =>
      customFetch<{ ok: boolean; calendarSummary: string; timeZone: string; message: string }>(
        "/api/client/tools/calendar/test",
        {
          method: "POST",
          body: JSON.stringify({
            calendarId: calendarId.trim() || "primary",
            serviceAccountKey: useCustomCalKey && calCustomKeyJson.trim() ? calCustomKeyJson.trim() : undefined,
          }),
        }
      ),
    onSuccess: (data) => {
      toast({
        title: isAr ? "الاتصال ناجح!" : "Connection Successful!",
        description: data.message || (isAr ? `متصل بالتقويم: ${data.calendarSummary}` : `Connected to: ${data.calendarSummary}`),
      });
      refetchEvents();
    },
    onError: (err: any) => {
      toast({
        title: isAr ? "فشل الاتصال" : "Connection Failed",
        description: err?.message || (isAr ? "تعذر الاتصال بتقويم Google" : "Could not connect to Google Calendar"),
        variant: "destructive",
      });
    },
  });

  // ── Create Event Mutation ────────────────────────────────────────────────
  const createEventMutation = useMutation({
    mutationFn: (payload: any) =>
      customFetch<{ ok: boolean; event: CalendarEvent }>("/api/client/tools/calendar/events", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast({
        title: isAr ? "تم حجز الموعد بنجاح" : "Event Created",
        description: isAr ? "تمت إضافة الموعد إلى تقويم Google" : "Appointment added to Google Calendar.",
      });
      setDialogOpen(false);
      setEventSummary("");
      setEventStartTime("");
      setEventEmail("");
      setEventDesc("");
      refetchEvents();
    },
    onError: (err: any) => {
      toast({
        title: isAr ? "فشل الحجز" : "Failed to create event",
        description: err?.message || (isAr ? "حدث خطأ أثناء إنشاء الموعد" : "Error creating appointment"),
        variant: "destructive",
      });
    },
  });

  // ── Save Sheets Mutation ─────────────────────────────────────────────────
  const saveSheetsMutation = useMutation({
    mutationFn: (payload: any) =>
      customFetch("/api/client/tools/sheets/config", {
        method: "PUT",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast({
        title: isAr ? "تم الحفظ بنجاح" : "Settings Saved",
        description: isAr
          ? "تم تحديث إعدادات جداول Google بنجاح"
          : "Google Sheets configuration updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["client-sheets-config"] });
    },
    onError: (err: any) => {
      toast({
        title: isAr ? "فشل الحفظ" : "Save Failed",
        description: err?.message || (isAr ? "حدث خطأ أثناء الحفظ" : "Error saving settings"),
        variant: "destructive",
      });
    },
  });

  // ── Test Sheets Mutation ─────────────────────────────────────────────────
  const testSheetsMutation = useMutation({
    mutationFn: () =>
      customFetch<{ success: boolean; message: string; sheetTitle?: string; availableTabs?: string[] }>(
        "/api/client/tools/sheets/test",
        {
          method: "POST",
          body: JSON.stringify({
            googleSheetsLink: sheetsLink.trim(),
            googleSheetsPage: sheetsPage.trim() || undefined,
            serviceAccountKey: sheetsCustomKey.trim() || undefined,
          }),
        }
      ),
    onSuccess: (data) => {
      setSheetsTestResult(data);
      toast({
        title: isAr ? "الاتصال ناجح!" : "Connection Successful!",
        description: data.message,
      });
    },
    onError: (err: any) => {
      const msg = err?.message || (isAr ? "تعذر الاتصال بجدول Google" : "Could not connect to Google Sheet");
      setSheetsTestResult({ success: false, message: msg });
      toast({
        title: isAr ? "فشل الاتصال" : "Connection Failed",
        description: msg,
        variant: "destructive",
      });
    },
  });

  const handleSaveCalendar = () => {
    saveCalMutation.mutate({
      googleCalendarEnabled: calEnabled,
      googleCalendarId: calendarId.trim() || "primary",
      googleCalendarTimezone: timezone,
      googleCalendarDuration: Number(duration) || 30,
      googleCalendarBookingRules: bookingRules,
      googleCalendarServiceAccountKey: useCustomCalKey ? (calCustomKeyJson.trim() || null) : null,
    });
  };

  const handleSaveSheets = () => {
    saveSheetsMutation.mutate({
      googleSheetsEnabled: sheetsEnabled,
      googleSheetsLink: sheetsLink.trim(),
      googleSheetsName: sheetsName.trim() || null,
      googleSheetsPage: sheetsPage.trim() || null,
      serviceAccountKey: sheetsCustomKey.trim() || undefined,
    });
  };

  const handleCreateEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventSummary.trim() || !eventStartTime) {
      toast({
        title: isAr ? "بيانات ناقصة" : "Missing fields",
        description: isAr ? "يرجى إدخال عنوان وتاريخ الموعد" : "Please provide title and start date/time",
        variant: "destructive",
      });
      return;
    }

    createEventMutation.mutate({
      summary: eventSummary.trim(),
      description: eventDesc.trim(),
      startTime: eventStartTime,
      durationMinutes: Number(eventDuration) || 30,
      attendeeEmail: eventEmail.trim() || undefined,
    });
  };

  const isCalConfigured = Boolean(calConfig?.hasCompanyKey || calConfig?.hasCustomKey);
  const isCalConnected = Boolean(calConfig?.googleCalendarEnabled && isCalConfigured);

  const isSheetsConfigured = Boolean(sheetsConfig?.hasServiceAccountKey && sheetsConfig?.googleSheetsLink);
  const isSheetsConnected = Boolean(sheetsConfig?.googleSheetsEnabled && isSheetsConfigured);

  return (
    <div className="space-y-6">
      {/* ── Bot Manager Hero Operations Banner ── */}
      <div
        className="relative overflow-hidden rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-blue-600/15 border border-white/10"
        style={{
          background: "linear-gradient(135deg, #1e40af 0%, #2563eb 50%, #1d4ed8 100%)",
        }}
      >
        <div className="absolute -right-10 -bottom-10 w-72 h-72 bg-white/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute right-40 -top-10 w-56 h-56 bg-blue-300/20 rounded-full blur-xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4 sm:gap-5">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white/15 backdrop-blur-md border border-white/25 shadow-[inset_0_0_0_2px_rgba(255,255,255,0.18)] flex items-center justify-center shrink-0">
              <i className="fa-solid fa-screwdriver-wrench text-2xl sm:text-3xl text-white"></i>
            </div>
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-[11px] font-semibold text-blue-100 mb-1.5 border border-white/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Workflow Automation & Tools
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white leading-tight">
                {isAr ? "الأدوات والتكاملات (Tools)" : "Tools & Integrations"}
              </h1>
              <p className="text-xs sm:text-sm text-blue-100/90 mt-1 max-w-xl leading-relaxed">
                {isAr
                  ? "إدارة الأدوات الخارجية وربطها مع المساعد الذكي لتنفيذ المهام والمزامنة التلقائية."
                  : "Manage external business tools and connect them with your AI Chatbot for seamless automation."}
              </p>
            </div>
          </div>

          {/* Tab Switcher Pills inside banner */}
          <div className="flex items-center gap-2 bg-white/15 backdrop-blur-md p-1.5 rounded-2xl border border-white/20 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setActiveTab("calendar");
                setLocation(location.startsWith("/admin") ? "/admin/tools/calendar" : "/client/tools/calendar");
              }}
              className={`flex items-center gap-2 text-xs font-bold h-9 rounded-xl transition-all ${
                activeTab === "calendar"
                  ? "bg-white text-blue-700 shadow-md"
                  : "text-blue-100 hover:text-white hover:bg-white/15"
              }`}
            >
              <CalendarIcon className="w-4 h-4" />
              {isAr ? "تقويم Google" : "Google Calendar"}
              {isCalConnected && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              )}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setActiveTab("sheets");
                setLocation(location.startsWith("/admin") ? "/admin/tools/sheets" : "/client/tools/sheets");
              }}
              className={`flex items-center gap-2 text-xs font-bold h-9 rounded-xl transition-all ${
                activeTab === "sheets"
                  ? "bg-white text-blue-700 shadow-md"
                  : "text-blue-100 hover:text-white hover:bg-white/15"
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              {isAr ? "جداول Google" : "Google Sheets"}
              {isSheetsConnected && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* ── GOOGLE CALENDAR VIEW ────────────────────────────────────────── */}
      {activeTab === "calendar" && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* Top Status & Quick Actions Banner */}
          <Card className="border-border bg-card/70 backdrop-blur-sm shadow-sm overflow-hidden">
            <div className="p-5 md:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/50 bg-gradient-to-r from-blue-500/5 via-card to-background">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                  <CalendarIcon className="w-6 h-6 text-blue-500" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-lg">
                      {isAr ? "تكامل تقويم Google" : "Google Calendar Integration"}
                    </h3>
                    {isCalConnected ? (
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 flex items-center gap-1 font-medium text-xs">
                        <CheckCircle2 className="w-3 h-3" />
                        {isAr ? "مفعّل ومتصل" : "Connected & Active"}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-muted text-muted-foreground border-border flex items-center gap-1 font-medium text-xs">
                        <AlertCircle className="w-3 h-3" />
                        {isAr ? "غير مفعّل" : "Inactive"}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {calConfig?.serviceAccountEmail ? (
                      <span className="font-mono text-[11px] text-foreground/80">
                        {calConfig.serviceAccountEmail}
                      </span>
                    ) : (
                      isAr ? "يتيح للمساعد الذكي الاطلاع على مواعيدك وحجز اجتماعات مع العملاء مباشرة." : "Allows the AI chatbot to view slots and book appointments directly with clients."
                    )}
                  </p>
                </div>
              </div>

              {/* Status Controls */}
              <div className="flex items-center gap-3 shrink-0">
                <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-background border border-border">
                  <label htmlFor="calendar-toggle" className="text-xs font-medium cursor-pointer">
                    {calEnabled ? (isAr ? "مفعّل" : "Enabled") : (isAr ? "معطّل" : "Disabled")}
                  </label>
                  <Switch
                    id="calendar-toggle"
                    checked={calEnabled}
                    onCheckedChange={(val) => setCalEnabled(val)}
                  />
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => testCalMutation.mutate()}
                  disabled={testCalMutation.isPending || !isCalConfigured}
                  className="flex items-center gap-1.5 text-xs h-9"
                >
                  {testCalMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                  {isAr ? "فحص الاتصال" : "Test Connection"}
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => window.open("https://calendar.google.com", "_blank")}
                  className="flex items-center gap-1.5 text-xs h-9 text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  {isAr ? "فتح التقويم" : "Open Calendar"}
                </Button>
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Configuration Form Column */}
            <div className="lg:col-span-7 space-y-6">
              <Card className="border-border bg-card shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Globe className="w-4 h-4 text-primary" />
                    {isAr ? "إعدادات الربط والتقويم" : "Calendar Configuration"}
                  </CardTitle>
                  <CardDescription>
                    {isAr
                      ? "حدد معرّف التقويم، والمنطقة الزمنية ومدة الاجتماعات الافتراضية."
                      : "Define your calendar ID, timezone, and standard meeting settings."}
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Calendar ID */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold flex items-center justify-between">
                      <span>{isAr ? "معرّف التقويم (Calendar ID):" : "Calendar ID:"}</span>
                      <span className="text-[11px] text-muted-foreground font-normal">
                        {isAr ? "الافتراضي primary للتقويم الرئيسي" : "Default is 'primary'"}
                      </span>
                    </label>
                    <Input
                      placeholder="primary or your-email@gmail.com"
                      value={calendarId}
                      onChange={(e) => setCalendarId(e.target.value)}
                      className="font-mono text-sm"
                    />
                  </div>

                  {/* Timezone & Duration Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold">
                        {isAr ? "المنطقة الزمنية (Timezone):" : "Timezone:"}
                      </label>
                      <select
                        value={timezone}
                        onChange={(e) => setTimezone(e.target.value)}
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        {COMMON_TIMEZONES.map((tz) => (
                          <option key={tz.value} value={tz.value}>
                            {tz.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold">
                        {isAr ? "مدة الموعد الافتراضية (بالدقائق):" : "Default Duration (minutes):"}
                      </label>
                      <select
                        value={duration}
                        onChange={(e) => setDuration(Number(e.target.value))}
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        <option value={15}>15 {isAr ? "دقيقة" : "minutes"}</option>
                        <option value={30}>30 {isAr ? "دقيقة (موصى به)" : "minutes (Recommended)"}</option>
                        <option value={45}>45 {isAr ? "دقيقة" : "minutes"}</option>
                        <option value={60}>60 {isAr ? "دقيقة (ساعة كاملة)" : "minutes (1 hour)"}</option>
                      </select>
                    </div>
                  </div>

                  {/* Credentials Section */}
                  <div className="p-4 rounded-xl border border-border/80 bg-muted/20 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                        {isAr ? "بيانات اعتماد Google Service Account:" : "Google Service Account:"}
                      </label>
                      {calConfig?.hasCompanyKey && (
                        <span className="text-[11px] text-emerald-500 flex items-center gap-1 font-medium">
                          <CheckCircle2 className="w-3 h-3" />
                          {isAr ? "حساب الشركة متوفر" : "Company Key Available"}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-4 text-xs">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="calAuthSource"
                          checked={!useCustomCalKey}
                          onChange={() => setUseCustomCalKey(false)}
                          className="accent-primary"
                        />
                        <span>{isAr ? "استخدام حساب خدمة الشركة (مشترك مع الجداول)" : "Use Company Service Account (Shared)"}</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="calAuthSource"
                          checked={useCustomCalKey}
                          onChange={() => setUseCustomCalKey(true)}
                          className="accent-primary"
                        />
                        <span>{isAr ? "مفتاح JSON مخصص للتقويم" : "Custom Service Account JSON"}</span>
                      </label>
                    </div>

                    {useCustomCalKey && (
                      <div className="space-y-1.5 pt-1">
                        <Textarea
                          rows={4}
                          placeholder='{"type": "service_account", "project_id": "...", "private_key": "...", "client_email": "..."}'
                          value={calCustomKeyJson}
                          onChange={(e) => setCalCustomKeyJson(e.target.value)}
                          className="font-mono text-xs"
                        />
                        <p className="text-[11px] text-muted-foreground">
                          {isAr
                            ? "الصق ملف JSON الخاص بحساب خدمة Google هنا."
                            : "Paste your Google Cloud Service Account JSON key here."}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Booking Rules / Instructions for AI */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold flex items-center justify-between">
                      <span>{isAr ? "تعليمات وقواعد حجز المواعيد للذكاء الاصطناعي:" : "AI Booking Instructions & Rules:"}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {isAr ? "يتم تضمينها تلقائياً للمساعد" : "Injected into AI system prompt"}
                      </span>
                    </label>
                    <Textarea
                      rows={3}
                      placeholder={
                        isAr
                          ? "مثال: متاح الحجز من الأحد إلى الخميس من 10 صباحاً إلى 6 مساءً. اطلب من العميل اسمه وبريده الإلكتروني وموضوع الاستشارة قبل التأكيد."
                          : "e.g., Working hours are Mon-Fri 9 AM - 5 PM. Always ask the client for their name, email, and meeting topic before confirming."
                      }
                      value={bookingRules}
                      onChange={(e) => setBookingRules(e.target.value)}
                      className="text-sm"
                    />
                  </div>
                </CardContent>

                <CardFooter className="flex justify-between items-center border-t border-border pt-4">
                  <div className="text-xs text-muted-foreground">
                    {saveCalMutation.isSuccess && (
                      <span className="text-emerald-500 font-medium flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {isAr ? "تم حفظ التعديلات" : "Saved"}
                      </span>
                    )}
                  </div>
                  <Button
                    onClick={handleSaveCalendar}
                    disabled={saveCalMutation.isPending}
                    className="flex items-center gap-2"
                  >
                    {saveCalMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                    {isAr ? "حفظ الإعدادات" : "Save Settings"}
                  </Button>
                </CardFooter>
              </Card>

              {/* Instructions Guide Card */}
              <Card className="border-border bg-card/60">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
                    <HelpCircle className="w-4 h-4 text-primary" />
                    {isAr ? "خطوات ربط وتفعيل تقويم Google:" : "How to Connect Google Calendar:"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2.5 text-xs text-muted-foreground leading-relaxed">
                  <div className="flex gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center shrink-0 text-[11px]">1</span>
                    <p>
                      {isAr
                        ? "من Google Cloud Console، تأكد من تفعيل مكتبة Google Calendar API."
                        : "Enable the 'Google Calendar API' in your Google Cloud Console."}
                    </p>
                  </div>
                  <div className="flex gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center shrink-0 text-[11px]">2</span>
                    <p>
                      {isAr
                        ? "انسخ بريد حساب الخدمة (Service Account Email) الموجود في الأعلى أو في مفتاح JSON."
                        : "Copy the Service Account Email shown in your service account credentials."}
                    </p>
                  </div>
                  <div className="flex gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center shrink-0 text-[11px]">3</span>
                    <p>
                      {isAr
                        ? "افتح إعدادات تقويمك في Google Calendar واذهب إلى قسم 'المشاركة مع أشخاص محددين'، وأضف بريد حساب الخدمة مع صلاحية 'إجراء تغييرات على الأحداث'."
                        : "In Google Calendar settings, go to 'Share with specific people', add the service account email, and set permission to 'Make changes to events'."}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Upcoming Appointments & Bookings Column */}
            <div className="lg:col-span-5 space-y-6">
              <Card className="border-border bg-card shadow-sm h-full flex flex-col">
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <CalendarCheck2 className="w-4 h-4 text-emerald-500" />
                      {isAr ? "المواعيد القادمة" : "Upcoming Appointments"}
                    </CardTitle>
                    <CardDescription>
                      {isAr ? "المواعيد المسجلة في تقويم Google" : "Live events synced from Google Calendar"}
                    </CardDescription>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => refetchEvents()}
                      disabled={fetchingEvents || !isCalConfigured}
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${fetchingEvents ? "animate-spin" : ""}`} />
                    </Button>

                    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                      <DialogTrigger asChild>
                        <Button
                          size="sm"
                          disabled={!isCalConfigured}
                          className="flex items-center gap-1 text-xs h-8"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          {isAr ? "موعد جديد" : "Add Event"}
                        </Button>
                      </DialogTrigger>

                      <DialogContent className="sm:max-w-md">
                        <form onSubmit={handleCreateEvent}>
                          <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                              <CalendarIcon className="w-5 h-5 text-primary" />
                              {isAr ? "جدولة موعد في تقويم Google" : "Schedule New Appointment"}
                            </DialogTitle>
                            <DialogDescription>
                              {isAr
                                ? "أدخل تفاصيل الموعد لحجزه وإضافته مباشرة في التقويم."
                                : "Add appointment details to record it directly into Google Calendar."}
                            </DialogDescription>
                          </DialogHeader>

                          <div className="space-y-3.5 py-4">
                            <div className="space-y-1">
                              <label className="text-xs font-semibold">{isAr ? "عنوان الموعد / اسم العميل:" : "Event Title / Client:"}</label>
                              <Input
                                required
                                placeholder={isAr ? "استشارة عقارية - أحمد محمد" : "Consultation - John Doe"}
                                value={eventSummary}
                                onChange={(e) => setEventSummary(e.target.value)}
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <label className="text-xs font-semibold">{isAr ? "تاريخ ووقت البدء:" : "Start Time:"}</label>
                                <Input
                                  required
                                  type="datetime-local"
                                  value={eventStartTime}
                                  onChange={(e) => setEventStartTime(e.target.value)}
                                  className="text-xs"
                                />
                              </div>

                              <div className="space-y-1">
                                <label className="text-xs font-semibold">{isAr ? "المدة:" : "Duration:"}</label>
                                <select
                                  value={eventDuration}
                                  onChange={(e) => setEventDuration(Number(e.target.value))}
                                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                                >
                                  <option value={15}>15 min</option>
                                  <option value={30}>30 min</option>
                                  <option value={45}>45 min</option>
                                  <option value={60}>60 min</option>
                                </select>
                              </div>
                            </div>

                            <div className="space-y-1">
                              <label className="text-xs font-semibold">{isAr ? "بريد العميل الإلكتروني (اختياري):" : "Client Email (Optional):"}</label>
                              <Input
                                type="email"
                                placeholder="client@example.com"
                                value={eventEmail}
                                onChange={(e) => setEventEmail(e.target.value)}
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="text-xs font-semibold">{isAr ? "ملاحظات أو وصف:" : "Notes / Description:"}</label>
                              <Textarea
                                rows={2}
                                placeholder={isAr ? "تفاصيل الاجتماع..." : "Meeting notes..."}
                                value={eventDesc}
                                onChange={(e) => setEventDesc(e.target.value)}
                              />
                            </div>
                          </div>

                          <DialogFooter>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setDialogOpen(false)}
                            >
                              {isAr ? "إلغاء" : "Cancel"}
                            </Button>
                            <Button
                              type="submit"
                              disabled={createEventMutation.isPending}
                              className="flex items-center gap-1.5"
                            >
                              {createEventMutation.isPending && (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              )}
                              {isAr ? "تأكيد الحجز" : "Confirm Booking"}
                            </Button>
                          </DialogFooter>
                        </form>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardHeader>

                <CardContent className="flex-1 overflow-y-auto max-h-[500px] p-4 space-y-3">
                  {!isCalConfigured ? (
                    <div className="py-12 text-center text-muted-foreground space-y-2">
                      <AlertCircle className="w-8 h-8 mx-auto text-amber-500 opacity-60" />
                      <p className="text-xs">
                        {isAr
                          ? "يرجى ربط حساب خدمة Google أولاً لعرض وحجز المواعيد."
                          : "Configure Google Service Account credentials to view and schedule appointments."}
                      </p>
                    </div>
                  ) : loadingEvents ? (
                    <div className="py-12 text-center text-muted-foreground space-y-2">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
                      <p className="text-xs">{isAr ? "جاري جلب المواعيد من تقويم Google..." : "Fetching appointments..."}</p>
                    </div>
                  ) : eventsData?.events && eventsData.events.length > 0 ? (
                    eventsData.events.map((evt) => {
                      const startDate = evt.start ? new Date(evt.start) : null;
                      const formattedTime = startDate
                        ? startDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                        : "";
                      const formattedDate = startDate
                        ? startDate.toLocaleDateString([], { month: "short", day: "numeric" })
                        : "";

                      return (
                        <div
                          key={evt.id}
                          className="p-3.5 rounded-xl border border-border/80 bg-background/60 hover:bg-background/90 transition-all space-y-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <h4 className="font-semibold text-sm truncate">{evt.summary}</h4>
                              <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                                <Clock className="w-3 h-3 text-primary shrink-0" />
                                <span>{formattedDate} • {formattedTime}</span>
                              </p>
                            </div>
                            <Badge variant="outline" className="text-[10px] capitalize bg-muted shrink-0">
                              {evt.status || "confirmed"}
                            </Badge>
                          </div>

                          {evt.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {evt.description}
                            </p>
                          )}

                          <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/40 text-xs">
                            {evt.attendees && evt.attendees.length > 0 ? (
                              <span className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                                <Mail className="w-3 h-3" />
                                {evt.attendees[0].email}
                              </span>
                            ) : (
                              <span />
                            )}

                            <div className="flex items-center gap-1.5 shrink-0">
                              {evt.meetLink && (
                                <a
                                  href={evt.meetLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 transition-colors"
                                >
                                  <Video className="w-3 h-3" />
                                  <span>Google Meet</span>
                                </a>
                              )}
                              {evt.htmlLink && (
                                <a
                                  href={evt.htmlLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-muted-foreground hover:text-foreground"
                                  title="View on Google Calendar"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="py-12 text-center text-muted-foreground space-y-2">
                      <CalendarIcon className="w-8 h-8 mx-auto opacity-40 text-muted-foreground" />
                      <p className="text-xs font-medium">
                        {isAr ? "لا توجد مواعيد قادمة مسجلة" : "No upcoming appointments"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {isAr
                          ? "يمكنك جدولة موعد جديد باستخدام الزر أعلاه."
                          : "You can schedule a new appointment using the button above."}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* ── GOOGLE SHEETS VIEW ──────────────────────────────────────────── */}
      {activeTab === "sheets" && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* Top Status & Quick Actions Banner */}
          <Card className="border-border bg-card/70 backdrop-blur-sm shadow-sm overflow-hidden">
            <div className="p-5 md:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/50 bg-gradient-to-r from-emerald-500/5 via-card to-background">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                  <FileSpreadsheet className="w-6 h-6 text-emerald-500" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-lg">
                      {isAr ? "تكامل جداول بيانات Google (Sheets)" : "Google Sheets Integration"}
                    </h3>
                    {isSheetsConnected ? (
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 flex items-center gap-1 font-medium text-xs">
                        <CheckCircle2 className="w-3 h-3" />
                        {isAr ? "مفعّل ومتصل" : "Connected & Active"}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-muted text-muted-foreground border-border flex items-center gap-1 font-medium text-xs">
                        <AlertCircle className="w-3 h-3" />
                        {isAr ? "غير مفعّل" : "Inactive"}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {sheetsConfig?.serviceAccountEmail ? (
                      <span className="font-mono text-[11px] text-foreground/80">
                        {sheetsConfig.serviceAccountEmail}
                      </span>
                    ) : (
                      isAr ? "تسجيل ومزامنة بيانات العملاء والاستفسارات تلقائياً في ملف Google Sheet في الوقت الفعلي." : "Automatically log customer leads, inquiries, and chat details to Google Sheets in real-time."
                    )}
                  </p>
                </div>
              </div>

              {/* Status Controls */}
              <div className="flex items-center gap-3 shrink-0">
                <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-background border border-border">
                  <label htmlFor="sheets-toggle" className="text-xs font-medium cursor-pointer">
                    {sheetsEnabled ? (isAr ? "مفعّل" : "Enabled") : (isAr ? "معطّل" : "Disabled")}
                  </label>
                  <Switch
                    id="sheets-toggle"
                    checked={sheetsEnabled}
                    onCheckedChange={(val) => setSheetsEnabled(val)}
                  />
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => testSheetsMutation.mutate()}
                  disabled={testSheetsMutation.isPending || !sheetsLink}
                  className="flex items-center gap-1.5 text-xs h-9"
                >
                  {testSheetsMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                  {isAr ? "فحص الاتصال" : "Test Connection"}
                </Button>

                {sheetsLink && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window.open(sheetsLink, "_blank")}
                    className="flex items-center gap-1.5 text-xs h-9 text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    {isAr ? "فتح الجدول" : "Open Sheet"}
                  </Button>
                )}
              </div>
            </div>

            {/* Test result banner if available */}
            {sheetsTestResult && (
              <div className={`px-6 py-3 border-b text-xs flex items-center justify-between gap-3 ${
                sheetsTestResult.success
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                  : "bg-destructive/10 border-destructive/20 text-destructive"
              }`}>
                <div className="flex items-center gap-2 min-w-0">
                  {sheetsTestResult.success ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0" />
                  )}
                  <span className="truncate">{sheetsTestResult.message}</span>
                </div>
                {sheetsTestResult.availableTabs && sheetsTestResult.availableTabs.length > 0 && (
                  <span className="text-[11px] opacity-80 shrink-0 font-mono">
                    {isAr ? "الصفحات المتوفرة:" : "Tabs:"} {sheetsTestResult.availableTabs.join(", ")}
                  </span>
                )}
              </div>
            )}
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Configuration Form Column */}
            <div className="lg:col-span-7 space-y-6">
              <Card className="border-border bg-card shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <TableProperties className="w-4 h-4 text-emerald-500" />
                    {isAr ? "بيانات ملف ورقة العمل (Google Sheet)" : "Spreadsheet Settings"}
                  </CardTitle>
                  <CardDescription>
                    {isAr
                      ? "أدخل رابط ملف Google Sheet واسم التبويب للمزامنة التلقائية."
                      : "Provide your Google Sheet link and target tab for automatic lead & chat sync."}
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Google Sheet URL */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <LinkIcon className="w-3.5 h-3.5 text-primary" />
                        {isAr ? "رابط ملف جدول بيانات Google (Sheet Link):" : "Google Sheet URL:"}
                      </span>
                      <span className="text-[11px] text-muted-foreground font-normal">
                        {isAr ? "انسخ الرابط كاملاً من المتصفح" : "Full browser URL"}
                      </span>
                    </label>
                    <Input
                      placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit"
                      value={sheetsLink}
                      onChange={(e) => {
                        setSheetsLink(e.target.value);
                        setSheetsTestResult(null);
                      }}
                      className="font-mono text-sm"
                    />
                  </div>

                  {/* Sheet Name & Page Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold">
                        {isAr ? "اسم توضيحي للجدول (اختياري):" : "Sheet Friendly Label:"}
                      </label>
                      <Input
                        placeholder={isAr ? "مثال: تتبع عملاء الواتساب والموقع" : "e.g. Sales Leads Tracker"}
                        value={sheetsName}
                        onChange={(e) => setSheetsName(e.target.value)}
                        className="text-sm"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold">
                        {isAr ? "اسم الصفحة / التبويب (Tab Name):" : "Sheet Tab Name (Page):"}
                      </label>
                      <Input
                        placeholder={isAr ? "مثال: Sheet1 أو العملاء" : "e.g. Sheet1 or Leads"}
                        value={sheetsPage}
                        onChange={(e) => {
                          setSheetsPage(e.target.value);
                          setSheetsTestResult(null);
                        }}
                        className="text-sm"
                      />
                    </div>
                  </div>

                  {/* Service Account Credentials Card */}
                  <div className="p-4 rounded-xl border border-border/80 bg-muted/20 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                        {isAr ? "حساب خدمة Google (Service Account Key):" : "Google Service Account:"}
                      </label>
                      {sheetsConfig?.hasServiceAccountKey && (
                        <span className="text-[11px] text-emerald-500 flex items-center gap-1 font-medium">
                          <CheckCircle2 className="w-3 h-3" />
                          {isAr ? "المفتاح مضاف ومحفوظ" : "Key Configured"}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground">
                      {sheetsConfig?.serviceAccountEmail ? (
                        <span>
                          {isAr ? "بريد حساب الخدمة المستخدم: " : "Service Account Email: "}
                          <strong className="text-foreground font-mono">{sheetsConfig.serviceAccountEmail}</strong>
                        </span>
                      ) : (
                        isAr
                          ? "يلزم إضافة مفتاح Google Service Account JSON حتى يتمكن النظام من القراءة والكتابة في الجدول."
                          : "Google Service Account JSON key is required to read and write to the spreadsheet."
                      )}
                    </p>

                    <div className="pt-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowSheetsKeyEdit(!showSheetsKeyEdit)}
                        className="text-xs h-7 text-primary hover:text-primary/80 px-0"
                      >
                        {showSheetsKeyEdit
                          ? (isAr ? "إخفاء محرر المفتاح ▲" : "Hide Key Editor ▲")
                          : (isAr ? "تعديل أو لصق مفتاح JSON جديد ▼" : "Edit / Paste Service Account Key ▼")}
                      </Button>

                      {showSheetsKeyEdit && (
                        <div className="space-y-1.5 pt-2">
                          <Textarea
                            rows={4}
                            placeholder='{"type": "service_account", "project_id": "...", "private_key": "...", "client_email": "..."}'
                            value={sheetsCustomKey}
                            onChange={(e) => setSheetsCustomKey(e.target.value)}
                            className="font-mono text-xs bg-background"
                          />
                          <p className="text-[11px] text-muted-foreground">
                            {isAr
                              ? "الصق محتوى ملف JSON بالكامل من Google Cloud Console."
                              : "Paste the complete JSON key content downloaded from Google Cloud Console."}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>

                <CardFooter className="flex justify-between items-center border-t border-border pt-4">
                  <div className="text-xs text-muted-foreground">
                    {saveSheetsMutation.isSuccess && (
                      <span className="text-emerald-500 font-medium flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {isAr ? "تم حفظ التعديلات" : "Saved"}
                      </span>
                    )}
                  </div>
                  <Button
                    onClick={handleSaveSheets}
                    disabled={saveSheetsMutation.isPending}
                    className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {saveSheetsMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                    {isAr ? "حفظ إعدادات الجدول" : "Save Sheet Settings"}
                  </Button>
                </CardFooter>
              </Card>

              {/* Instructions Guide Card */}
              <Card className="border-border bg-card/60">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
                    <HelpCircle className="w-4 h-4 text-emerald-500" />
                    {isAr ? "خطوات ربط ومشاركة جدول بيانات Google:" : "How to Connect Google Sheets:"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2.5 text-xs text-muted-foreground leading-relaxed">
                  <div className="flex gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-500 font-bold flex items-center justify-center shrink-0 text-[11px]">1</span>
                    <p>
                      {isAr
                        ? "أنشئ جدول بيانات جديد أو افتح جدولك الحالي في Google Sheets."
                        : "Open your target Google Spreadsheet in Google Sheets."}
                    </p>
                  </div>
                  <div className="flex gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-500 font-bold flex items-center justify-center shrink-0 text-[11px]">2</span>
                    <p>
                      {isAr
                        ? "اضغط على زر 'مشاركة (Share)' في أعلى يمين الملف، وأضف بريد حساب الخدمة (Service Account Email) بصلاحية 'محرر (Editor)'."
                        : "Click 'Share' at the top-right of your spreadsheet and add the Service Account Email with 'Editor' permissions."}
                    </p>
                  </div>
                  <div className="flex gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-500 font-bold flex items-center justify-center shrink-0 text-[11px]">3</span>
                    <p>
                      {isAr
                        ? "انسخ رابط الصفحة من شريط المتصفح والصقه في خانة الرابط أعلاه، ثم اضغط 'فحص الاتصال'."
                        : "Copy the full URL from your browser address bar, paste it above, and click 'Test Connection'."}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Information & Synchronized Data Details Column */}
            <div className="lg:col-span-5 space-y-6">
              <Card className="border-border bg-card shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Database className="w-4 h-4 text-emerald-500" />
                    {isAr ? "ما الذي تتم مزامنته تلقائياً؟" : "What Gets Synced Automatically?"}
                  </CardTitle>
                  <CardDescription>
                    {isAr
                      ? "تسجيل بيانات المحادثات والعملاء المحتملين في الوقت الفعلي"
                      : "Real-time logging of customer inquiries and lead contacts"}
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4 text-xs">
                  <div className="p-3.5 rounded-xl border border-border/80 bg-background/60 space-y-2">
                    <h5 className="font-semibold text-foreground flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      {isAr ? "تسجيل بيانات العملاء (Leads Capture)" : "Lead Capture Logging"}
                    </h5>
                    <p className="text-muted-foreground leading-relaxed">
                      {isAr
                        ? "عندما يطلب العميل استفساراً أو يشارك بياناته في المحادثة (الاسم، رقم الهاتف، البريد الإلكتروني)، يقوم المساعد بتسجيل صف جديد فورياً داخل الجدول."
                        : "When a customer shares contact details (Name, Phone, Email) or submits an inquiry, a new row is instantly appended to your Google Sheet."}
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl border border-border/80 bg-background/60 space-y-2">
                    <h5 className="font-semibold text-foreground flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      {isAr ? "الأعمدة الموثقة في الجدول" : "Recorded Columns"}
                    </h5>
                    <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                      <li>{isAr ? "التاريخ والوقت (Date & Time)" : "Date & Timestamp"}</li>
                      <li>{isAr ? "اسم العميل (Customer Name)" : "Customer Name"}</li>
                      <li>{isAr ? "رقم الهاتف / واتساب (Phone Number)" : "Phone Number"}</li>
                      <li>{isAr ? "البريد الإلكتروني (Email)" : "Email Address"}</li>
                      <li>{isAr ? "القناة (WhatsApp, Telegram, Widget, Messenger)" : "Channel Source"}</li>
                      <li>{isAr ? "ملخص الاستفسار / الطلب (Inquiry Summary)" : "Inquiry Summary & Topic"}</li>
                    </ul>
                  </div>

                  <div className="p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 space-y-1.5 text-emerald-700 dark:text-emerald-400">
                    <p className="font-medium flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5" />
                      {isAr ? "مزامنة لحظية عبر جميع القنوات" : "Omnichannel Live Sync"}
                    </p>
                    <p className="text-[11px] opacity-90 leading-relaxed">
                      {isAr
                        ? "سواء تحدث العميل من خلال واتساب أو تيليجرام أو شات الموقع، يتم تجميع كل الاستفسارات في جدولك المركزي بسلاسة."
                        : "Whether customers connect via WhatsApp, Telegram, or your Website Widget, all leads funnel into your unified Google Sheet."}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
