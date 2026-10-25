import { useUpdateClientSettings, useGetMe } from "@workspace/api-client-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Globe, User, Lock, ShieldCheck, Mail, Key, Send, Loader2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";

const formSchema = z.object({
  newUsername: z.string().min(3, "Username must be at least 3 characters").optional().or(z.literal("")),
  currentPassword: z.string().optional().or(z.literal("")),
  newPassword: z.string().min(6, "New password must be at least 6 characters").optional().or(z.literal("")),
  notificationEmail: z.string().email("Invalid email").optional().or(z.literal("")),
  resendApiKey: z.string().optional().or(z.literal("")),
}).refine((data) => {
  if ((data.newPassword || (data.newUsername && data.newUsername.trim())) && !data.currentPassword) {
    return false;
  }
  return true;
}, {
  message: "Current password is required to change username or password",
  path: ["currentPassword"],
});

export default function ClientSettings() {
  const updateSettings = useUpdateClientSettings();
  const { data: me } = useGetMe();
  const { toast } = useToast();
  const { lang, setLang, t } = useLanguage();
  const [isSendingTest, setIsSendingTest] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      newUsername: "",
      currentPassword: "",
      newPassword: "",
      notificationEmail: "",
      resendApiKey: "",
    },
  });

  useEffect(() => {
    if (me) {
      if ((me as any).notificationEmail !== undefined) {
        form.setValue("notificationEmail", (me as any).notificationEmail || "");
      }
      if ((me as any).resendApiKey !== undefined) {
        form.setValue("resendApiKey", (me as any).resendApiKey || "");
      }
    }
  }, [me, form]);

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    const data: any = {};
    if (values.currentPassword?.trim()) data.currentPassword = values.currentPassword.trim();
    if (values.newUsername?.trim()) data.newUsername = values.newUsername.trim();
    if (values.newPassword) data.newPassword = values.newPassword;
    if (values.notificationEmail !== undefined) data.notificationEmail = values.notificationEmail.trim();
    if (values.resendApiKey !== undefined) data.resendApiKey = values.resendApiKey.trim();

    updateSettings.mutate({ data }, {
      onSuccess: () => {
        toast({ title: lang === "ar" ? "تم حفظ التغييرات بنجاح" : "Settings updated successfully" });
        form.reset({
          newUsername: "",
          currentPassword: "",
          newPassword: "",
          notificationEmail: values.notificationEmail || "",
          resendApiKey: values.resendApiKey || "",
        });
      },
      onError: (error: any) => {
        toast({
          title: lang === "ar" ? "فشل التحديث" : "Update failed",
          description: error.message,
          variant: "destructive",
        });
      }
    });
  };

  const handleSendTestEmail = async () => {
    const email = form.getValues("notificationEmail")?.trim();
    const resendApiKey = form.getValues("resendApiKey")?.trim();

    if (!email) {
      toast({
        title: lang === "ar" ? "البريد الإلكتروني مطلوب" : "Email Required",
        description: lang === "ar" ? "يرجى كتابة بريد Gmail أولاً لإرسال بريد تجريبي إليه." : "Please enter a Gmail address first.",
        variant: "destructive",
      });
      return;
    }

    setIsSendingTest(true);
    try {
      const res = await fetch("/api/client/send-test-notification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email,
          resendApiKey: resendApiKey || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        toast({
          title: lang === "ar" ? "✅ تم إرسال البريد التجريبي بنجاح" : "✅ Test Email Sent Successfully",
          description: lang === "ar"
            ? `تم إرسال إشعار تجريبي إلى ${email}. يرجى التحقق من صندوق الوارد أو مجلد الرسائل غير المرغوب فيها (Spam).`
            : `Test email sent to ${email}. Please check your inbox or spam folder.`,
        });
      } else {
        toast({
          title: lang === "ar" ? "❌ تعذر إرسال البريد التجريبي" : "❌ Test Email Failed",
          description: data.error || (lang === "ar" ? "فشل إرسال البريد التجريبي عبر Resend" : "Failed to send test email via Resend"),
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({
        title: lang === "ar" ? "خطأ في الشبكة" : "Network Error",
        description: err.message || (lang === "ar" ? "تعذر إرسال الطلب إلى الخادم" : "Could not connect to server"),
        variant: "destructive",
      });
    } finally {
      setIsSendingTest(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Hero Operations Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 p-6 sm:p-8 text-white shadow-xl shadow-blue-500/10">
        <div className="absolute -right-10 -top-10 h-44 w-44 rounded-full bg-white/10 blur-2xl pointer-events-none" />
        <div className="absolute -left-10 -bottom-10 h-44 w-44 rounded-full bg-blue-400/20 blur-2xl pointer-events-none" />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white/15 backdrop-blur-md border border-white/25 flex items-center justify-center shadow-[inset_0_0_0_2px_rgba(255,255,255,0.18)] shrink-0">
              <i className="fa-solid fa-sliders text-2xl sm:text-3xl text-white"></i>
            </div>
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-white/15 border border-white/20 text-xs font-semibold tracking-wide uppercase text-blue-100 mb-1.5 backdrop-blur-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                {lang === "ar" ? "تفضيلات وإعدادات الحساب" : "Account & Preferences"}
              </div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight drop-shadow-sm">{t("client_settings_title")}</h1>
              <p className="text-blue-100 text-xs sm:text-sm mt-1 max-w-xl font-normal opacity-90">{t("client_settings_desc")}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Language */}
      <Card className="bg-card border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-sm hover:shadow-md transition-all overflow-hidden">
        <CardHeader className="p-5 sm:p-6 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200/50 dark:border-blue-800/50 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 shadow-inner">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-base sm:text-lg font-bold">
                {t("settings_language")}
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm mt-0.5">{t("settings_language_desc")}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-5 sm:p-6 pt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <button
              type="button"
              onClick={() => setLang("en")}
              className={`flex items-center justify-between p-4 rounded-xl border-2 text-sm font-semibold transition-all ${
                lang === "en"
                  ? "border-blue-600 bg-blue-50/70 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 shadow-sm ring-2 ring-blue-500/20"
                  : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-muted-foreground hover:text-foreground bg-muted/20"
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">🇬🇧</span>
                <div className="text-left">
                  <p className="font-bold text-foreground">English</p>
                  <p className="text-[11px] text-muted-foreground">{t("settings_lang_english")}</p>
                </div>
              </div>
              {lang === "en" && (
                <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">
                  ✓
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setLang("ar")}
              className={`flex items-center justify-between p-4 rounded-xl border-2 text-sm font-semibold transition-all ${
                lang === "ar"
                  ? "border-blue-600 bg-blue-50/70 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 shadow-sm ring-2 ring-blue-500/20"
                  : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-muted-foreground hover:text-foreground bg-muted/20"
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">🇸🇦</span>
                <div className="text-right">
                  <p className="font-bold text-foreground">العربية</p>
                  <p className="text-[11px] text-muted-foreground">{t("settings_lang_arabic")}</p>
                </div>
              </div>
              {lang === "ar" && (
                <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">
                  ✓
                </span>
              )}
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Account credentials */}
      <Card className="bg-card border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-sm hover:shadow-md transition-all overflow-hidden">
        <CardHeader className="p-5 sm:p-6 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200/50 dark:border-indigo-800/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 shadow-inner">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-base sm:text-lg font-bold">
                {t("settings_security")}
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm mt-0.5">{t("settings_security_client_desc")}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-5 sm:p-6 pt-2">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">

              {/* Current username display */}
              {me?.name && (
                <div className="flex items-center justify-between gap-3 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-xs">
                      <User className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground block">{lang === "ar" ? "اسم المستخدم الحالي" : "Current username"}</span>
                      <span className="font-bold text-foreground">{(me as any).username ?? me.name}</span>
                    </div>
                  </div>
                  <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    {lang === "ar" ? "حساب نشط" : "Active"}
                  </span>
                </div>
              )}

              <FormField
                control={form.control}
                name="newUsername"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1.5 font-semibold text-sm">
                      <User className="w-4 h-4 text-blue-600 dark:text-blue-400" /> {lang === "ar" ? "اسم المستخدم الجديد" : "New Username"}
                    </FormLabel>
                    <FormControl>
                      <Input placeholder={lang === "ar" ? "اتركه فارغاً للإبقاء على الحالي" : "Leave blank to keep current"} {...field} className="bg-background rounded-xl h-10 border-slate-200 dark:border-slate-800 focus-visible:ring-blue-500" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="notificationEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5 font-semibold text-sm">
                        <Mail className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        {lang === "ar" ? "البريد الإلكتروني للإشعارات (Gmail)" : "Notification Email (Gmail)"}
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder={lang === "ar" ? "أدخل بريد Gmail لتلقي الإشعارات" : "Enter Gmail to receive notifications"}
                          {...field}
                          className="bg-background rounded-xl h-10 border-slate-200 dark:border-slate-800 focus-visible:ring-blue-500"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="resendApiKey"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5 font-semibold text-sm">
                        <Key className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        {lang === "ar" ? "المفتاح السري (RESEND_API_KEY)" : "Secret (RESEND_API_KEY)"}
                      </FormLabel>
                      <FormControl>
                        <PasswordInput
                          placeholder="re_xxxxxxxxxxxxxxxxx"
                          {...field}
                          className="bg-background font-mono text-xs rounded-xl h-10 border-slate-200 dark:border-slate-800 focus-visible:ring-blue-500"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Test Email Action Card */}
              <div className="rounded-xl border border-blue-200/80 dark:border-blue-900/50 bg-gradient-to-r from-blue-50/70 to-indigo-50/50 dark:from-blue-950/30 dark:to-indigo-950/20 p-4 space-y-3">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p className="font-bold text-foreground text-sm flex items-center gap-2 text-blue-900 dark:text-blue-100">
                      <Mail className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      {lang === "ar" ? "اختبار وصول رسائل البريد (Gmail)" : "Test Email Notification Delivery"}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      {lang === "ar"
                        ? "أرسل بريداً تجريبياً فورياً للتحقق من صحة مفتاح Resend والتأكد من استلام الإشعارات في صندوق الوارد."
                        : "Send an instant test email via Resend to verify your API Key and ensure notifications arrive."}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isSendingTest}
                    onClick={handleSendTestEmail}
                    className="shrink-0 flex items-center gap-2 bg-white dark:bg-slate-900 border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 font-bold rounded-xl shadow-sm px-4 py-2 h-auto"
                  >
                    {isSendingTest ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        {lang === "ar" ? "جارٍ الإرسال..." : "Sending..."}
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        {lang === "ar" ? "إرسال بريد تجريبي" : "Send Test Email"}
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <div className="border-t border-slate-200/80 dark:border-slate-800 pt-5 space-y-4">
                <FormField
                  control={form.control}
                  name="currentPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5 font-semibold text-sm">
                        <Lock className="w-4 h-4 text-slate-500" /> {t("label_current_password")}
                      </FormLabel>
                      <FormControl>
                        <PasswordInput placeholder={lang === "ar" ? "مطلوبة فقط عند تغيير اسم المستخدم أو كلمة المرور" : "Required only when changing username or password"} {...field} className="bg-background rounded-xl h-10 border-slate-200 dark:border-slate-800 focus-visible:ring-blue-500" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="newPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5 font-semibold text-sm">
                        <Lock className="w-4 h-4 text-slate-500" /> {t("label_new_password_optional")}
                      </FormLabel>
                      <FormControl>
                        <PasswordInput placeholder={lang === "ar" ? "اتركها فارغة للإبقاء على الحالية" : "Leave blank to keep current"} {...field} className="bg-background rounded-xl h-10 border-slate-200 dark:border-slate-800 focus-visible:ring-blue-500" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="pt-2">
                <Button type="submit" disabled={updateSettings.isPending} className="bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md shadow-blue-600/25 px-8 py-2.5 h-auto text-sm transition-all hover:shadow-lg">
                  {updateSettings.isPending ? t("btn_saving") : t("btn_save_changes")}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
