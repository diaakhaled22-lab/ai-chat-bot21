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
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("client_settings_title")}</h1>
        <p className="text-muted-foreground mt-2">{t("client_settings_desc")}</p>
      </div>

      {/* Language */}
      <Card className="bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-primary" />
            {t("settings_language")}
          </CardTitle>
          <CardDescription>{t("settings_language_desc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setLang("en")}
              className={`flex-1 py-3 px-4 rounded-lg border-2 text-sm font-medium transition-all ${
                lang === "en"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-border/80 hover:text-foreground"
              }`}
            >
              🇬🇧 {t("settings_lang_english")}
            </button>
            <button
              type="button"
              onClick={() => setLang("ar")}
              className={`flex-1 py-3 px-4 rounded-lg border-2 text-sm font-medium transition-all ${
                lang === "ar"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-border/80 hover:text-foreground"
              }`}
            >
              🇸🇦 {t("settings_lang_arabic")}
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Account credentials */}
      <Card className="bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" />
            {t("settings_security")}
          </CardTitle>
          <CardDescription>{t("settings_security_client_desc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">

              {/* Current username display */}
              {me?.name && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/40 rounded-lg px-4 py-3">
                  <User className="w-4 h-4 shrink-0" />
                  <span>{lang === "ar" ? "اسم المستخدم الحالي:" : "Current username:"} <span className="font-medium text-foreground">{(me as any).username ?? me.name}</span></span>
                </div>
              )}

              <FormField
                control={form.control}
                name="newUsername"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5" /> {lang === "ar" ? "اسم المستخدم الجديد" : "New Username"}
                    </FormLabel>
                    <FormControl>
                      <Input placeholder={lang === "ar" ? "اتركه فارغاً للإبقاء على الحالي" : "Leave blank to keep current"} {...field} className="bg-background" />
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
                      <FormLabel className="flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5 text-primary" />
                        {lang === "ar" ? "البريد الإلكتروني للإشعارات (Gmail)" : "Notification Email (Gmail)"}
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder={lang === "ar" ? "أدخل بريد Gmail لتلقي الإشعارات" : "Enter Gmail to receive notifications"}
                          {...field}
                          className="bg-background"
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
                      <FormLabel className="flex items-center gap-1.5">
                        <Key className="w-3.5 h-3.5 text-primary" />
                        {lang === "ar" ? "المفتاح السري (RESEND_API_KEY)" : "Secret (RESEND_API_KEY)"}
                      </FormLabel>
                      <FormControl>
                        <PasswordInput
                          placeholder="re_xxxxxxxxxxxxxxxxx"
                          {...field}
                          className="bg-background font-mono text-xs"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Test Email Action Card */}
              <div className="rounded-lg border border-border/80 bg-muted/30 p-3 space-y-2">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <p className="font-semibold text-foreground text-sm flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-primary" />
                      {lang === "ar" ? "اختبار وصول رسائل البريد (Gmail)" : "Test Email Notification Delivery"}
                    </p>
                    <p>
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
                    className="shrink-0 flex items-center gap-1.5 border-primary/50 text-primary hover:bg-primary/10"
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

              <div className="border-t border-border pt-4 space-y-4">
                <FormField
                  control={form.control}
                  name="currentPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5" /> {t("label_current_password")}
                      </FormLabel>
                      <FormControl>
                        <PasswordInput placeholder={lang === "ar" ? "مطلوبة فقط عند تغيير اسم المستخدم أو كلمة المرور" : "Required only when changing username or password"} {...field} className="bg-background" />
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
                      <FormLabel className="flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5" /> {t("label_new_password_optional")}
                      </FormLabel>
                      <FormControl>
                        <PasswordInput placeholder={lang === "ar" ? "اتركها فارغة للإبقاء على الحالية" : "Leave blank to keep current"} {...field} className="bg-background" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Button type="submit" disabled={updateSettings.isPending}>
                {updateSettings.isPending ? t("btn_saving") : t("btn_save_changes")}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
