import React, { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  MessageCircle,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  AlertTriangle,
  HelpCircle,
  CheckCircle2,
  ChevronRight,
  BookOpen,
  Phone,
  Layers,
  Bot,
  Zap,
  Globe,
  Settings,
  Users,
  Mic,
  MessageSquare,
} from "lucide-react";
import { customFetch, useGetClientCompany } from "@workspace/api-client-react";

import { ChannelIcon } from "@/components/ChannelIcon";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";

function usePlatformWebhooks() {
  return useQuery<{
    messenger: { webhookUrl: string; verifyToken: string | null };
    whatsapp: { webhookUrl: string; verifyToken: string | null };
  }>({
    queryKey: ["client-platform-webhooks"],
    queryFn: () => customFetch("/api/client/platform-webhooks"),
    staleTime: Infinity,
  });
}

export default function ClientChannelsGuide() {
  const { lang } = useLanguage();
  const { toast } = useToast();
  const { data: company } = useGetClientCompany();
  const { data: platformConfig, isLoading: isWebhooksLoading } = usePlatformWebhooks();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("whatsapp");

  const copyToClipboard = (text: string, label: string, key: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast({
      title: lang === "ar" ? "تم النسخ بنجاح" : "Copied!",
      description: lang === "ar" ? `تم نسخ ${label} إلى الحافظة.` : `${label} copied to clipboard.`,
    });
    setTimeout(() => {
      setCopiedKey((prev) => (prev === key ? null : prev));
    }, 2500);
  };

  const whatsappWebhookUrl =
    platformConfig?.whatsapp?.webhookUrl ?? `${window.location.origin}/api/whatsapp/webhook`;
  const whatsappVerifyToken =
    platformConfig?.whatsapp?.verifyToken ?? "—";

  const messengerWebhookUrl =
    platformConfig?.messenger?.webhookUrl ?? `${window.location.origin}/api/messenger/webhook`;
  const messengerVerifyToken =
    platformConfig?.messenger?.verifyToken ?? "—";

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16">
      {/* ── Top Hero Banner ── */}
      <div
        className="relative overflow-hidden rounded-3xl p-5 sm:p-7 md:p-8 text-white shadow-xl shadow-blue-600/15 border border-white/10"
        style={{
          background: "linear-gradient(135deg, #1e3a8a 0%, #2563eb 50%, #1d4ed8 100%)",
        }}
      >
        <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-white/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute right-40 -top-10 w-48 h-48 bg-blue-300/20 rounded-full blur-xl pointer-events-none" />

        <div className="relative z-10 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-5">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl bg-white/15 backdrop-blur-md border border-white/25 shadow-[inset_0_0_0_2px_rgba(255,255,255,0.18)] flex items-center justify-center shrink-0 mt-0.5">
              <BookOpen className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/15 backdrop-blur-md text-[11px] font-semibold text-blue-100 mb-2 border border-white/20">
                {lang === "ar" ? "دليل الإعداد والتكامل" : "Integration & Setup Guide"}
              </div>
              <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold tracking-tight text-white leading-tight">
                {lang === "ar"
                  ? "دليل ربط وتفعيل واتساب وفيسبوك ماسنجر"
                  : "WhatsApp & Messenger Integration Guide"}
              </h1>
              <p className="text-xs sm:text-sm text-blue-100/90 mt-2 max-w-2xl leading-relaxed">
                {lang === "ar"
                  ? "خطوات عملية ومفصلة لربط شركتك بـ Meta Cloud API، ليتمكن البوت الذكي من استقبال رسائل العملاء والرد الفوري عليها على مدار الساعة بدون توقف."
                  : "Step-by-step instructions to connect your business with Meta Cloud API so the AI chatbot can receive customer inquiries and reply automatically 24/7."}
              </p>
            </div>
          </div>

          <div className="flex sm:flex-col gap-2 shrink-0 justify-end">
            <Link href="/client/channels">
              <Button
                variant="secondary"
                className="w-full bg-white text-blue-700 hover:bg-blue-50 font-bold shadow-md gap-2 rounded-xl text-xs sm:text-sm cursor-pointer"
              >
                <Settings className="w-4 h-4 text-blue-600" />
                {lang === "ar" ? "إعدادات القنوات" : "Channels Settings"}
              </Button>
            </Link>
            <Link href="/client/chat-logs">
              <Button
                variant="ghost"
                className="w-full bg-white/10 hover:bg-white/20 text-white font-medium border border-white/20 gap-2 rounded-xl text-xs sm:text-sm cursor-pointer"
              >
                <MessageSquare className="w-4 h-4 text-blue-200" />
                {lang === "ar" ? "سجل المحادثات" : "Chat Logs"}
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* ── Key Highlights Strip ── */}
      <div className="grid sm:grid-cols-3 gap-3">
        <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-card border border-[#DCE7FF] dark:border-slate-800 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/20">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-bold text-foreground">
              {lang === "ar" ? "رد فوري 24/7" : "Instant 24/7 Replies"}
            </p>
            <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
              {lang === "ar" ? "إجابة آلية مدعومة بالذكاء الاصطناعي ومعلومات شركتك" : "AI automated responses grounded in your data"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-card border border-[#DCE7FF] dark:border-slate-800 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 border border-blue-500/20">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-bold text-foreground">
              {lang === "ar" ? "تحويل للموظف البشري" : "Human Handoff"}
            </p>
            <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
              {lang === "ar" ? "إشعار فوري عند طلب العميل التحدث مع ممثل الخدمة" : "Seamless live notifications when agent is requested"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-card border border-[#DCE7FF] dark:border-slate-800 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0 border border-violet-500/20">
            <Mic className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-bold text-foreground">
              {lang === "ar" ? "رسائل صوتية ذكية" : "AI Voice Notes"}
            </p>
            <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
              {lang === "ar" ? "إمكانية إرسال الردود بصوت بشري طبيعي على واتساب" : "Optional natural human voice notes on WhatsApp"}
            </p>
          </div>
        </div>
      </div>

      {/* ── Main Tabs: WhatsApp vs Messenger vs FAQs ── */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid grid-cols-3 w-full max-w-md mx-auto p-1 bg-muted/60 rounded-2xl border border-border">
          <TabsTrigger
            value="whatsapp"
            className="flex items-center gap-2 rounded-xl text-xs sm:text-sm font-bold data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm transition-all"
          >
            <ChannelIcon channel="whatsapp" size={18} />
            <span>{lang === "ar" ? "واتساب للأعمال" : "WhatsApp"}</span>
          </TabsTrigger>
          <TabsTrigger
            value="messenger"
            className="flex items-center gap-2 rounded-xl text-xs sm:text-sm font-bold data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm transition-all"
          >
            <ChannelIcon channel="messenger" size={18} />
            <span>{lang === "ar" ? "فيسبوك ماسنجر" : "Messenger"}</span>
          </TabsTrigger>
          <TabsTrigger
            value="faq"
            className="flex items-center gap-2 rounded-xl text-xs sm:text-sm font-bold data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm transition-all"
          >
            <HelpCircle className="w-4 h-4 text-amber-500" />
            <span>{lang === "ar" ? "أسئلة شائعة" : "FAQs"}</span>
          </TabsTrigger>
        </TabsList>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* ── TAB 1: WHATSAPP CLOUD API SETUP ────────────────────────────── */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="whatsapp" className="space-y-6 outline-none animate-in fade-in-50 duration-200">
          {/* Quick Copy Credentials Card */}
          <Card className="bg-card border-[#DCE7FF] dark:border-slate-800 shadow-sm border-l-4 border-l-emerald-500">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base sm:text-lg flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                  <ChannelIcon channel="whatsapp" size={22} />
                  {lang === "ar" ? "بيانات الـ Webhook الخاصة بشركتك" : "Your WhatsApp Webhook Credentials"}
                </CardTitle>
                <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                  {lang === "ar" ? "جاهزة للنسخ في Meta" : "Ready for Meta Dashboard"}
                </Badge>
              </div>
              <CardDescription className="text-xs">
                {lang === "ar"
                  ? "انسخ هذا الرابط ورمز التحقق لاستخدامهما في إعدادات Webhook داخل حسابك في Meta for Developers."
                  : "Copy these endpoints to paste inside your Meta Developers Dashboard → WhatsApp → Configuration."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid md:grid-cols-2 gap-3">
                {/* Webhook URL */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground flex items-center justify-between">
                    <span>{lang === "ar" ? "رابط الويب هوك (Callback URL)" : "Webhook Callback URL"}</span>
                    <span className="text-[10px] text-emerald-500 font-mono">POST</span>
                  </label>
                  <div className="relative group flex items-center">
                    <pre className="w-full bg-muted/40 border border-border rounded-xl px-3.5 py-2.5 font-mono text-xs overflow-x-auto text-foreground">
                      {whatsappWebhookUrl}
                    </pre>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(whatsappWebhookUrl, "WhatsApp Webhook URL", "wa_url")}
                      className="absolute right-1.5 top-1.5 h-7 px-2.5 rounded-lg bg-background/80 hover:bg-background border border-border text-xs gap-1 cursor-pointer"
                    >
                      {copiedKey === "wa_url" ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                          <span className="text-emerald-500 text-[11px] font-semibold">{lang === "ar" ? "تم النسخ" : "Copied"}</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span className="text-[11px]">{lang === "ar" ? "نسخ" : "Copy"}</span>
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Verify Token */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground flex items-center justify-between">
                    <span>{lang === "ar" ? "رمز التحقق (Verify Token)" : "Verify Token"}</span>
                    <span className="text-[10px] text-muted-foreground">{lang === "ar" ? "أمان الـ Webhook" : "Security Token"}</span>
                  </label>
                  <div className="relative group flex items-center">
                    <pre className="w-full bg-muted/40 border border-border rounded-xl px-3.5 py-2.5 font-mono text-xs overflow-x-auto text-foreground">
                      {whatsappVerifyToken}
                    </pre>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(whatsappVerifyToken, "Verify Token", "wa_token")}
                      className="absolute right-1.5 top-1.5 h-7 px-2.5 rounded-lg bg-background/80 hover:bg-background border border-border text-xs gap-1 cursor-pointer"
                    >
                      {copiedKey === "wa_token" ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                          <span className="text-emerald-500 text-[11px] font-semibold">{lang === "ar" ? "تم النسخ" : "Copied"}</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span className="text-[11px]">{lang === "ar" ? "نسخ" : "Copy"}</span>
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* WhatsApp Step-by-Step Guide */}
          <div className="space-y-4">
            <h2 className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-emerald-500/15 text-emerald-600 flex items-center justify-center text-sm font-extrabold">1</span>
              {lang === "ar" ? "خطوات الربط خطوة بخطوة عبر Meta Developers" : "Step-by-Step Meta WhatsApp Setup"}
            </h2>

            <div className="grid gap-4">
              {/* Step 1 */}
              <div className="p-4 sm:p-5 rounded-2xl bg-card border border-border shadow-sm flex flex-col sm:flex-row gap-4 items-start">
                <div className="w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm flex items-center justify-center shrink-0">
                  1
                </div>
                <div className="space-y-2 flex-1">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <h3 className="font-bold text-sm sm:text-base text-foreground">
                      {lang === "ar" ? "إنشاء حساب وتطبيق مطورين في Meta" : "Create a Meta Developer App"}
                    </h3>
                    <a
                      href="https://developers.facebook.com/apps"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline font-semibold inline-flex items-center gap-1"
                    >
                      developers.facebook.com <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {lang === "ar"
                      ? "ادخل إلى منصة مطوري Meta وسجل الدخول بحساب فيسبوك، ثم اضغط على زر (Create App). اختر نوع التطبيق (Other) ثم حدد (Business). اكتب اسم التطبيق (مثال: اسم شركتك Bot) ثم اضغط إنشاء."
                      : "Go to Meta for Developers, sign in, and click Create App. Select 'Other', then choose 'Business'. Enter your app name and create the app."}
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="p-4 sm:p-5 rounded-2xl bg-card border border-border shadow-sm flex flex-col sm:flex-row gap-4 items-start">
                <div className="w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm flex items-center justify-center shrink-0">
                  2
                </div>
                <div className="space-y-2 flex-1">
                  <h3 className="font-bold text-sm sm:text-base text-foreground">
                    {lang === "ar" ? "إضافة منتج WhatsApp إلى التطبيق" : "Add WhatsApp Product"}
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {lang === "ar"
                      ? "من لوحة تحكم التطبيق، ابحث عن منتج (WhatsApp) واضغط على زر (Set up). سينقلك مباشرة إلى شاشة الإعداد الأولية (API Setup)."
                      : "From the app dashboard, find WhatsApp and click 'Set up'. This will take you to the WhatsApp API Setup screen."}
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="p-4 sm:p-5 rounded-2xl bg-card border border-border shadow-sm flex flex-col sm:flex-row gap-4 items-start">
                <div className="w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm flex items-center justify-center shrink-0">
                  3
                </div>
                <div className="space-y-2 flex-1">
                  <h3 className="font-bold text-sm sm:text-base text-foreground">
                    {lang === "ar" ? "استخراج البيانات الثلاثة المطلوبة للربط" : "Collect the 3 Required Credentials"}
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {lang === "ar"
                      ? "من القائمة الجانبية في Meta، اذهب إلى: WhatsApp ← API Setup:"
                      : "From the sidebar in Meta, go to: WhatsApp → API Setup:"}
                  </p>
                  <div className="grid sm:grid-cols-3 gap-2.5 pt-1">
                    <div className="p-2.5 rounded-xl bg-muted/40 border border-border text-xs space-y-1">
                      <span className="font-bold text-foreground block">Phone Number ID</span>
                      <span className="text-[11px] text-muted-foreground block">
                        {lang === "ar" ? "معرف رقم الهاتف الخاص بك" : "Your Phone Number ID"}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-muted/40 border border-border text-xs space-y-1">
                      <span className="font-bold text-foreground block">WABA ID</span>
                      <span className="text-[11px] text-muted-foreground block">
                        {lang === "ar" ? "معرف حساب واتساب للأعمال" : "WhatsApp Business Account ID"}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-muted/40 border border-border text-xs space-y-1">
                      <span className="font-bold text-foreground block">System User Token</span>
                      <span className="text-[11px] text-muted-foreground block">
                        {lang === "ar" ? "رمز وصول دائم (Permanent Token)" : "Permanent Access Token"}
                      </span>
                    </div>
                  </div>
                  <div className="mt-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      {lang === "ar"
                        ? "ملاحظة هامة: الرمز الموجود في صفحة API Setup هو رمز تجريبي مؤقت ينتهي بعد 24 ساعة. لضمان استمرار البوت بدون انقطاع، قم بإنشاء System User في إعدادات الأعمال (Business Settings) واستخرج منه رمز دائم لا ينتهي بصلاحية whatsapp_business_messaging."
                        : "Important Note: The token shown in API Setup expires in 24 hours. To run permanently, create a System User in Business Settings with 'whatsapp_business_messaging' permission to generate a non-expiring permanent token."}
                    </span>
                  </div>
                </div>
              </div>

              {/* Step 4 */}
              <div className="p-4 sm:p-5 rounded-2xl bg-card border border-border shadow-sm flex flex-col sm:flex-row gap-4 items-start">
                <div className="w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm flex items-center justify-center shrink-0">
                  4
                </div>
                <div className="space-y-2 flex-1">
                  <h3 className="font-bold text-sm sm:text-base text-foreground">
                    {lang === "ar" ? "تهيئة وتفعيل الـ Webhook" : "Configure the Webhook"}
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {lang === "ar"
                      ? "من القائمة الجانبية في Meta، اذهب إلى: WhatsApp ← Configuration:"
                      : "From the sidebar in Meta, navigate to: WhatsApp → Configuration:"}
                  </p>
                  <ul className="text-xs text-muted-foreground space-y-1.5 list-disc list-inside">
                    <li>
                      {lang === "ar"
                        ? "اضغط على زر (Edit) في قسم الـ Webhook."
                        : "Click 'Edit' in the Webhook section."}
                    </li>
                    <li>
                      {lang === "ar"
                        ? "الصق رابط الويب هوك (Callback URL) المنسوخ من الصندوق الأخضر بالأعلى."
                        : "Paste the Webhook Callback URL copied from the top box."}
                    </li>
                    <li>
                      {lang === "ar"
                        ? "الصق رمز التحقق (Verify Token) ثم اضغط على (Verify and Save)."
                        : "Paste the Verify Token and click 'Verify and Save'."}
                    </li>
                    <li>
                      {lang === "ar"
                        ? "في قسم Webhook fields بالأسفل، اضغط (Manage) واشترك في حقل (messages) باختيار Subscribe."
                        : "In Webhook fields below, click 'Manage' and subscribe to the 'messages' field."}
                    </li>
                  </ul>
                </div>
              </div>

              {/* Step 5 */}
              <div className="p-4 sm:p-5 rounded-2xl bg-card border border-border shadow-sm flex flex-col sm:flex-row gap-4 items-start">
                <div className="w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-600 font-bold text-sm flex items-center justify-center shrink-0">
                  <Check className="w-4 h-4" />
                </div>
                <div className="space-y-2 flex-1">
                  <h3 className="font-bold text-sm sm:text-base text-foreground">
                    {lang === "ar" ? "الحفظ في منصة Bot Manager وبدء الرد الآلي" : "Save in Bot Manager & Start Chatting"}
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {lang === "ar"
                      ? "انتقل إلى صفحة قنوات التواصل في منصتك، فعّل مفتاح واتساب، الصق البيانات (الرمز، Phone ID، WABA ID، رقم الهاتف بصيغة دولية بدون أصفار أو زائد)، ثم اضغط (حفظ إعدادات القنوات). مبروك! البوت الآن جاهز للرد على كل الرسائل الواردة فوراً."
                      : "Head to your Channels page in Bot Manager, toggle WhatsApp switch, paste your credentials, and click 'Save'. Congratulations! Your AI chatbot is now live and replying automatically."}
                  </p>
                  <div className="pt-2">
                    <Link href="/client/channels">
                      <Button className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 rounded-xl text-xs font-semibold cursor-pointer">
                        <ChannelIcon channel="whatsapp" size={16} />
                        {lang === "ar" ? "الانتقال لصفحة قنوات التواصل لحفظ البيانات" : "Go to Channels Page to Save"}
                        <ChevronRight className="w-3.5 h-3.5" />
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* ── TAB 2: MESSENGER SETUP ─────────────────────────────────────── */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="messenger" className="space-y-6 outline-none animate-in fade-in-50 duration-200">
          {/* Quick Copy Credentials Card for Messenger */}
          <Card className="bg-card border-[#DCE7FF] dark:border-slate-800 shadow-sm border-l-4 border-l-blue-600">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base sm:text-lg flex items-center gap-2 text-blue-600 dark:text-blue-400">
                  <ChannelIcon channel="messenger" size={22} />
                  {lang === "ar" ? "بيانات الـ Webhook الخاصة بفيسبوك ماسنجر" : "Your Messenger Webhook Credentials"}
                </CardTitle>
                <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-600 border-blue-500/30">
                  {lang === "ar" ? "جاهزة للنسخ في Meta" : "Ready for Meta Dashboard"}
                </Badge>
              </div>
              <CardDescription className="text-xs">
                {lang === "ar"
                  ? "استخدم هذا الرابط ورمز التحقق في إعدادات Messenger Webhook داخل تطبيقك في Meta for Developers."
                  : "Use this Webhook URL and Verify Token in your Meta Developers App → Messenger → Settings."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid md:grid-cols-2 gap-3">
                {/* Webhook URL */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground flex items-center justify-between">
                    <span>{lang === "ar" ? "رابط الويب هوك (Callback URL)" : "Webhook Callback URL"}</span>
                    <span className="text-[10px] text-blue-500 font-mono">POST</span>
                  </label>
                  <div className="relative group flex items-center">
                    <pre className="w-full bg-muted/40 border border-border rounded-xl px-3.5 py-2.5 font-mono text-xs overflow-x-auto text-foreground">
                      {messengerWebhookUrl}
                    </pre>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(messengerWebhookUrl, "Messenger Webhook URL", "msg_url")}
                      className="absolute right-1.5 top-1.5 h-7 px-2.5 rounded-lg bg-background/80 hover:bg-background border border-border text-xs gap-1 cursor-pointer"
                    >
                      {copiedKey === "msg_url" ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                          <span className="text-emerald-500 text-[11px] font-semibold">{lang === "ar" ? "تم النسخ" : "Copied"}</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span className="text-[11px]">{lang === "ar" ? "نسخ" : "Copy"}</span>
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Verify Token */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground flex items-center justify-between">
                    <span>{lang === "ar" ? "رمز التحقق (Verify Token)" : "Verify Token"}</span>
                    <span className="text-[10px] text-muted-foreground">{lang === "ar" ? "أمان الـ Webhook" : "Security Token"}</span>
                  </label>
                  <div className="relative group flex items-center">
                    <pre className="w-full bg-muted/40 border border-border rounded-xl px-3.5 py-2.5 font-mono text-xs overflow-x-auto text-foreground">
                      {messengerVerifyToken}
                    </pre>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(messengerVerifyToken, "Verify Token", "msg_token")}
                      className="absolute right-1.5 top-1.5 h-7 px-2.5 rounded-lg bg-background/80 hover:bg-background border border-border text-xs gap-1 cursor-pointer"
                    >
                      {copiedKey === "msg_token" ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                          <span className="text-emerald-500 text-[11px] font-semibold">{lang === "ar" ? "تم النسخ" : "Copied"}</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span className="text-[11px]">{lang === "ar" ? "نسخ" : "Copy"}</span>
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Messenger Step-by-Step Guide */}
          <div className="space-y-4">
            <h2 className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-blue-600/15 text-blue-600 flex items-center justify-center text-sm font-extrabold">2</span>
              {lang === "ar" ? "خطوات ربط فيسبوك ماسنجر خطوة بخطوة" : "Step-by-Step Messenger Setup"}
            </h2>

            <div className="grid gap-4">
              {/* Step 1 */}
              <div className="p-4 sm:p-5 rounded-2xl bg-card border border-border shadow-sm flex flex-col sm:flex-row gap-4 items-start">
                <div className="w-8 h-8 rounded-full bg-blue-600/10 text-blue-600 font-bold text-sm flex items-center justify-center shrink-0">
                  1
                </div>
                <div className="space-y-2 flex-1">
                  <h3 className="font-bold text-sm sm:text-base text-foreground">
                    {lang === "ar" ? "إضافة منتج Messenger للتطبيق" : "Add Messenger Product to your Meta App"}
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {lang === "ar"
                      ? "في حسابك في Meta for Developers، افتح تطبيقك واضغط على (Add Product) من القائمة الجانبية، ثم اختر منتج (Messenger) واضغط على (Set up)."
                      : "In Meta for Developers, open your app, click 'Add Product' from the sidebar, find 'Messenger', and click 'Set up'."}
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="p-4 sm:p-5 rounded-2xl bg-card border border-border shadow-sm flex flex-col sm:flex-row gap-4 items-start">
                <div className="w-8 h-8 rounded-full bg-blue-600/10 text-blue-600 font-bold text-sm flex items-center justify-center shrink-0">
                  2
                </div>
                <div className="space-y-2 flex-1">
                  <h3 className="font-bold text-sm sm:text-base text-foreground">
                    {lang === "ar" ? "ربط صفحة الفيسبوك واستخراج رمز وصول الصفحة (Page Access Token)" : "Connect Page & Generate Page Access Token"}
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {lang === "ar"
                      ? "من القائمة الجانبية، ادخل إلى Messenger ← Settings. في قسم (Access Tokens)، اضغط على (Add or remove Pages)، اختر صفحة فيسبوك الرسمية لشركتك وامنحها الصلاحيات المطلوبة (مثل pages_messaging)، ثم اضغط (Generate Token) وانسخ الرمز الطويل الناتج."
                      : "Go to Messenger → Settings. In the 'Access Tokens' section, click 'Add or remove Pages', select your Facebook Page, grant messaging permissions, then click 'Generate Token' and copy the token."}
                  </p>
                  <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-700 dark:text-blue-300 flex items-start gap-2">
                    <Sparkles className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      {lang === "ar"
                        ? "نصيحة: تأكد من استخدام Page Access Token وليس User Token أو App Token لكي تتمكن المنصة من الرد باسم الصفحة رسمياً."
                        : "Tip: Make sure you use a Page Access Token so the bot can respond under your Page's official identity."}
                    </span>
                  </div>
                </div>
              </div>

              {/* Step 3 */}
              <div className="p-4 sm:p-5 rounded-2xl bg-card border border-border shadow-sm flex flex-col sm:flex-row gap-4 items-start">
                <div className="w-8 h-8 rounded-full bg-blue-600/10 text-blue-600 font-bold text-sm flex items-center justify-center shrink-0">
                  3
                </div>
                <div className="space-y-2 flex-1">
                  <h3 className="font-bold text-sm sm:text-base text-foreground">
                    {lang === "ar" ? "ربط الـ Webhook والاشتراك في أحداث الرسائل" : "Set Callback URL & Subscribe to Messages"}
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {lang === "ar"
                      ? "في نفس الصفحة (Messenger ← Settings)، انزل إلى قسم (Webhooks):"
                      : "In Messenger → Settings, scroll down to the 'Webhooks' section:"}
                  </p>
                  <ul className="text-xs text-muted-foreground space-y-1.5 list-disc list-inside">
                    <li>
                      {lang === "ar"
                        ? "اضغط (Add Callback URL)."
                        : "Click 'Add Callback URL'."}
                    </li>
                    <li>
                      {lang === "ar"
                        ? "الصق رابط الويب هوك الخاص بماسبنجر المنسوخ من الصندوق الأزرق بالأعلى."
                        : "Paste the Messenger Callback URL copied from the top blue box."}
                    </li>
                    <li>
                      {lang === "ar"
                        ? "الصق رمز التحقق (Verify Token) ثم اضغط (Verify and Save)."
                        : "Paste the Verify Token and click 'Verify and Save'."}
                    </li>
                    <li>
                      {lang === "ar"
                        ? "اضغط على (Add Subscriptions) لصفحتك وفعّل: messages و messaging_postbacks."
                        : "Click 'Add Subscriptions' for your Page and enable 'messages' and 'messaging_postbacks'."}
                    </li>
                  </ul>
                </div>
              </div>

              {/* Step 4 */}
              <div className="p-4 sm:p-5 rounded-2xl bg-card border border-border shadow-sm flex flex-col sm:flex-row gap-4 items-start">
                <div className="w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-600 font-bold text-sm flex items-center justify-center shrink-0">
                  <Check className="w-4 h-4" />
                </div>
                <div className="space-y-2 flex-1">
                  <h3 className="font-bold text-sm sm:text-base text-foreground">
                    {lang === "ar" ? "الحفظ واختبار المحادثة المباشرة" : "Save in Platform & Test"}
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {lang === "ar"
                      ? "ارجع إلى صفحة قنوات التواصل في منصتك، فعّل مفتاح فيسبوك ماسنجر، الصق Page Access Token واضغط حفظ. سيتم جلب Page ID تلقائياً. يمكنك الآن إرسال رسالة تجريبية لصفحة فيسبوك وستصلك إجابة البوت في ثوانٍ!"
                      : "Return to Channels in your dashboard, toggle Messenger ON, paste the Page Access Token, and save. Page ID will be detected automatically. Send a message to your Page to verify instant replies!"}
                  </p>
                  <div className="pt-2">
                    <Link href="/client/channels">
                      <Button className="bg-blue-600 hover:bg-blue-700 text-white gap-2 rounded-xl text-xs font-semibold cursor-pointer">
                        <ChannelIcon channel="messenger" size={16} />
                        {lang === "ar" ? "الانتقال لصفحة قنوات التواصل لحفظ الرمز" : "Go to Channels to Save Token"}
                        <ChevronRight className="w-3.5 h-3.5" />
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* ── TAB 3: FAQs & TROUBLESHOOTING ──────────────────────────────── */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="faq" className="space-y-6 outline-none animate-in fade-in-50 duration-200">
          <Card className="bg-card border border-border shadow-sm">
            <CardHeader>
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-amber-500" />
                {lang === "ar" ? "الأسئلة الشائعة وحلول المشاكل المحتملة" : "Frequently Asked Questions & Troubleshooting"}
              </CardTitle>
              <CardDescription className="text-xs">
                {lang === "ar"
                  ? "إجابات فورية لأكثر الأسئلة تكراراً عند ربط واتساب وفيسبوك ماسنجر."
                  : "Quick troubleshooting answers for common issues when setting up WhatsApp and Messenger."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="space-y-2">
                {/* Q1 */}
                <AccordionItem value="q1" className="border border-border rounded-xl px-3 bg-muted/20">
                  <AccordionTrigger className="text-xs sm:text-sm font-bold hover:no-underline py-3">
                    {lang === "ar"
                      ? "لماذا توقف واتساب عن الرد بعد مرور 24 ساعة؟"
                      : "Why did WhatsApp stop replying after 24 hours?"}
                  </AccordionTrigger>
                  <AccordionContent className="text-xs text-muted-foreground leading-relaxed pb-3">
                    {lang === "ar"
                      ? "الرمز المؤقت الظاهر في شاشة API Setup هو رمز تجريبي تنتهي صلاحيته تلقائياً بعد 24 ساعة. لتشغيل البوت بشكل دائم بدون توقف، يجب الذهاب إلى Business Settings ← System Users، إنشاء مستخدم نظام بصلاحية Admin، وإصدار رمز دائم (Permanent Token) باختيار صلاحية whatsapp_business_messaging."
                      : "The token shown in API Setup is a temporary 24-hour test token. To run permanently, create a System User in Meta Business Settings and generate a permanent token with whatsapp_business_messaging permission."}
                  </AccordionContent>
                </AccordionItem>

                {/* Q2 */}
                <AccordionItem value="q2" className="border border-border rounded-xl px-3 bg-muted/20">
                  <AccordionTrigger className="text-xs sm:text-sm font-bold hover:no-underline py-3">
                    {lang === "ar"
                      ? "هل يمكنني استخدام رقم هاتف مسجل حالياً في تطبيق WhatsApp على هاتفي؟"
                      : "Can I use a phone number already active on the WhatsApp mobile app?"}
                  </AccordionTrigger>
                  <AccordionContent className="text-xs text-muted-foreground leading-relaxed pb-3">
                    {lang === "ar"
                      ? "لا تسمح Meta بتشغيل الرقم في تطبيق WhatsApp العادي و WhatsApp Cloud API في نفس الوقت. لاستخدام رقمك الحالي: يجب فتح تطبيق واتساب على هاتفك، الدخول إلى (الإعدادات ← الحساب ← حذف حسابي)، ثم إضافة الرقم في لوحة Meta Cloud API. أو يمكنك استخدام رقم هاتف جديد مخصص للشركة."
                      : "Meta does not permit a number to be active on the regular WhatsApp mobile app and WhatsApp Cloud API simultaneously. You must delete the account from the mobile app first or register a new dedicated number."}
                  </AccordionContent>
                </AccordionItem>

                {/* Q3 */}
                <AccordionItem value="q3" className="border border-border rounded-xl px-3 bg-muted/20">
                  <AccordionTrigger className="text-xs sm:text-sm font-bold hover:no-underline py-3">
                    {lang === "ar"
                      ? "كيف يتم التعامل مع طلبات التحدث إلى ممثل خدمة عملاء بشري؟"
                      : "How does the bot handle requests to talk to a human agent?"}
                  </AccordionTrigger>
                  <AccordionContent className="text-xs text-muted-foreground leading-relaxed pb-3">
                    {lang === "ar"
                      ? "منصتنا تدعم التحويل البشري الذكي تلقائياً (Human Handoff). عندما يكتب العميل عبارات مثل (أريد التحدث مع موظف، أرجو تحويلي لخدمة العملاء)، يتعرف البوت على النية ويقوم بإيقاف الرد الآلي مؤقتاً لتلك المحادثة ويرسل إشعاراً فورياً للمسؤول أو يتم تنبيه فريقك للتدخل اليدوي."
                      : "Our platform supports automated Human Handoff. When a customer asks to speak with a human, the bot pauses automated replies for that chat and dispatches a live handoff notification."}
                  </AccordionContent>
                </AccordionItem>

                {/* Q4 */}
                <AccordionItem value="q4" className="border border-border rounded-xl px-3 bg-muted/20">
                  <AccordionTrigger className="text-xs sm:text-sm font-bold hover:no-underline py-3">
                    {lang === "ar"
                      ? "أين يمكنني مراجعة سجلات المحادثات ومتابعة أداء البوت؟"
                      : "Where can I view chat logs and track conversations?"}
                  </AccordionTrigger>
                  <AccordionContent className="text-xs text-muted-foreground leading-relaxed pb-3">
                    {lang === "ar"
                      ? "جميع المحادثات الواردة من واتساب، ماسنجر، وتيليجرام يتم تسجيلها وحفظها في صفحة (سجل المحادثات Chat Logs) مع توضيح القناة ورقم العميل ومحتوى الردود واستهلاك الرموز في الوقت الفعلي."
                      : "All conversations from WhatsApp, Messenger, and Telegram are logged in real-time under 'Chat Logs' with channel badge, customer ID, full dialogue history, and token usage."}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
