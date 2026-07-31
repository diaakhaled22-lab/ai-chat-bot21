import { useUpdateClientSettings, useGetMe } from "@workspace/api-client-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Globe, User, Lock, ShieldCheck } from "lucide-react";

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
    },
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    const data: any = { currentPassword: values.currentPassword };
    if (values.newUsername?.trim()) data.newUsername = values.newUsername.trim();
    if (values.newPassword) data.newPassword = values.newPassword;

    updateSettings.mutate({ data }, {
      onSuccess: () => {
        toast({ title: "Settings updated successfully" });
        form.reset({ newUsername: "", currentPassword: "", newPassword: "" });
      },
      onError: (error: any) => {
        toast({ title: "Update failed", description: error.message, variant: "destructive" });
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
                  <span>Current username: <span className="font-medium text-foreground">{(me as any).username ?? me.name}</span></span>
                </div>
              )}

              <FormField
                control={form.control}
                name="newUsername"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5" /> New Username
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="Leave blank to keep current" {...field} className="bg-background" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="border-t border-border pt-4 space-y-4">
                <FormField
                  control={form.control}
                  name="currentPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5" /> Current Password <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <PasswordInput placeholder="Required to save any change" {...field} className="bg-background" />
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
                        <Lock className="w-3.5 h-3.5" /> New Password
                      </FormLabel>
                      <FormControl>
                        <PasswordInput placeholder="Leave blank to keep current" {...field} className="bg-background" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Button type="submit" disabled={updateSettings.isPending}>
                {updateSettings.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
