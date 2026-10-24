import { useState } from "react";
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
  const { lang } = useLanguage();
  const isAr = lang === "ar";
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Local form state
  const [activeTab, setActiveTab] = useState<"calendar">("calendar");
  const [calendarId, setCalendarId] = useState("primary");
  const [enabled, setEnabled] = useState(false);
  const [timezone, setTimezone] = useState("UTC");
  const [duration, setDuration] = useState(30);
  const [bookingRules, setBookingRules] = useState("");
  const [customKeyJson, setCustomKeyJson] = useState("");
  const [useCustomKey, setUseCustomKey] = useState(false);
  const [isFormInitialized, setIsFormInitialized] = useState(false);

  // New Event Modal state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [eventSummary, setEventSummary] = useState("");
  const [eventStartTime, setEventStartTime] = useState("");
  const [eventDuration, setEventDuration] = useState(30);
  const [eventEmail, setEventEmail] = useState("");
  const [eventDesc, setEventDesc] = useState("");

  // Fetch config
  const { data: config, isLoading: loadingConfig, refetch: refetchConfig } = useQuery<CalendarConfig>({
    queryKey: ["client-calendar-config"],
    queryFn: async () => {
      const res = await customFetch<CalendarConfig>("/api/client/tools/calendar/config");
      if (!isFormInitialized && res) {
        setEnabled(res.googleCalendarEnabled ?? false);
        setCalendarId(res.googleCalendarId || "primary");
        setTimezone(res.googleCalendarTimezone || "UTC");
        setDuration(res.googleCalendarDuration || 30);
        setBookingRules(res.googleCalendarBookingRules || "");
        setUseCustomKey(res.hasCustomKey);
        setIsFormInitialized(true);
      }
      return res;
    },
  });

  // Fetch upcoming events
  const {
    data: eventsData,
    isLoading: loadingEvents,
    refetch: refetchEvents,
    isFetching: fetchingEvents,
  } = useQuery<{ ok: boolean; events: CalendarEvent[]; error?: string }>({
    queryKey: ["client-calendar-events"],
    queryFn: () => customFetch<{ ok: boolean; events: CalendarEvent[]; error?: string }>("/api/client/tools/calendar/events"),
    enabled: Boolean(config?.googleCalendarEnabled && (config?.hasCompanyKey || config?.hasCustomKey)),
    retry: false,
  });

  // Save Config Mutation
  const saveMutation = useMutation({
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

  // Test Connection Mutation
  const testMutation = useMutation({
    mutationFn: () =>
      customFetch<{ ok: boolean; calendarSummary: string; timeZone: string; message: string }>(
        "/api/client/tools/calendar/test",
        {
          method: "POST",
          body: JSON.stringify({
            calendarId: calendarId.trim() || "primary",
            serviceAccountKey: useCustomKey && customKeyJson.trim() ? customKeyJson.trim() : undefined,
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

  // Create Event Mutation
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

  const handleSave = () => {
    saveMutation.mutate({
      googleCalendarEnabled: enabled,
      googleCalendarId: calendarId.trim() || "primary",
      googleCalendarTimezone: timezone,
      googleCalendarDuration: Number(duration) || 30,
      googleCalendarBookingRules: bookingRules,
      googleCalendarServiceAccountKey: useCustomKey ? (customKeyJson.trim() || null) : null,
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

  const isConfigured = Boolean(config?.hasCompanyKey || config?.hasCustomKey);
  const isConnected = Boolean(config?.googleCalendarEnabled && isConfigured);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2.5">
            <Wrench className="w-6 h-6 text-primary" />
            {isAr ? "الأدوات والتكاملات (Tools)" : "Tools & Integrations"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isAr
              ? "إدارة الأدوات الخارجية وربطها مع المساعد الذكي لتنفيذ المهام وحجز المواعيد تلقائياً."
              : "Manage external productivity tools and integrate them with your AI Chatbot for automated booking."}
          </p>
        </div>

        {/* Tab Pills */}
        <div className="flex items-center gap-2 bg-muted/50 p-1 rounded-lg border border-border">
          <Button
            variant={activeTab === "calendar" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("calendar")}
            className="flex items-center gap-2 text-xs font-semibold h-8"
          >
            <CalendarIcon className="w-3.5 h-3.5" />
            {isAr ? "تقويم Google (Calendar)" : "Google Calendar"}
            {isConnected && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            )}
          </Button>
        </div>
      </div>

      {/* Main Content Area */}
      {activeTab === "calendar" && (
        <div className="space-y-6">
          {/* Top Status & Quick Actions Banner */}
          <Card className="border-border bg-card/70 backdrop-blur-sm shadow-sm overflow-hidden">
            <div className="p-5 md:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/50 bg-gradient-to-r from-primary/5 via-card to-background">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                  <CalendarIcon className="w-6 h-6 text-blue-500" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-lg">
                      {isAr ? "تكامل تقويم Google" : "Google Calendar Integration"}
                    </h3>
                    {isConnected ? (
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
                    {config?.serviceAccountEmail ? (
                      <span className="font-mono text-[11px] text-foreground/80">
                        {config.serviceAccountEmail}
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
                    {enabled ? (isAr ? "مفعّل" : "Enabled") : (isAr ? "معطّل" : "Disabled")}
                  </label>
                  <Switch
                    id="calendar-toggle"
                    checked={enabled}
                    onCheckedChange={(val) => {
                      setEnabled(val);
                    }}
                  />
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => testMutation.mutate()}
                  disabled={testMutation.isPending || !isConfigured}
                  className="flex items-center gap-1.5 text-xs h-9"
                >
                  {testMutation.isPending ? (
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
                      {config?.hasCompanyKey && (
                        <span className="text-[11px] text-emerald-500 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          {isAr ? "حساب الشركة متوفر" : "Company Key Available"}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-4 text-xs">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="authSource"
                          checked={!useCustomKey}
                          onChange={() => setUseCustomKey(false)}
                          className="accent-primary"
                        />
                        <span>{isAr ? "استخدام حساب خدمة الشركة (مشترك)" : "Use Company Service Account (Shared)"}</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="authSource"
                          checked={useCustomKey}
                          onChange={() => setUseCustomKey(true)}
                          className="accent-primary"
                        />
                        <span>{isAr ? "مفتاح JSON مخصص للتقويم" : "Custom Service Account JSON"}</span>
                      </label>
                    </div>

                    {useCustomKey && (
                      <div className="space-y-1.5 pt-1">
                        <Textarea
                          rows={4}
                          placeholder='{"type": "service_account", "project_id": "...", "private_key": "...", "client_email": "..."}'
                          value={customKeyJson}
                          onChange={(e) => setCustomKeyJson(e.target.value)}
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
                    {saveMutation.isSuccess && (
                      <span className="text-emerald-500 font-medium flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {isAr ? "تم حفظ التعديلات" : "Saved"}
                      </span>
                    )}
                  </div>
                  <Button
                    onClick={handleSave}
                    disabled={saveMutation.isPending}
                    className="flex items-center gap-2"
                  >
                    {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
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
                      disabled={fetchingEvents || !isConfigured}
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${fetchingEvents ? "animate-spin" : ""}`} />
                    </Button>

                    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                      <DialogTrigger asChild>
                        <Button
                          size="sm"
                          disabled={!isConfigured}
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
                  {!isConfigured ? (
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
    </div>
  );
}
