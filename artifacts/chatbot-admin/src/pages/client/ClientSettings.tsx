import { useUpdateClientSettings, useGetMe } from "@workspace/api-client-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Globe, User, Lock, ShieldCheck, Mail, Key } from "lucide-react";

import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";

const formSchema = z.object({
  newUsername: z.string().min(3, "Username must be at least 3 characters").optional().or(z.literal("")),
  currentPassword: z.string().min(1, "Current password is required to save changes"),
  newPassword: z.string().min(6, "New password must be at least 6 characters").optional().or(z.literal("")),
  notificationEmail: z.string().email("Invalid email").optional().or(z.literal("")),
  resendApiKey: z.string().optional().or(z.literal("")),
});

export default function ClientSettings() {
  const updateSettings = useUpdateClientSettings();
  const { data: me } = useGetMe();
  const { toast } = useToast();
  const { lang, setLang, t } = useLanguage();

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
    const data: any = { currentPassword: values.currentPassword };
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

              <div className="border-t border-border pt-4 space-y-4">
                <FormField
                  control={form.control}
                  name="currentPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5" /> {t("label_current_password")} <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <PasswordInput placeholder={lang === "ar" ? "مطلوبة لحفظ أي تغييرات" : "Required to save any change"} {...field} className="bg-background" />
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
