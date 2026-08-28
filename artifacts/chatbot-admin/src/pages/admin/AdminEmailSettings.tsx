import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useState, useEffect } from "react";
import { Mail, Eye, EyeOff, CheckCircle2, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

type SmtpEncryption = "tls" | "ssl" | "none";

interface EmailSettings {
  recipientEmail: string;
  smtpHost: string;
  smtpPort: string;
  smtpUser: string;
  smtpEncryption: SmtpEncryption;
  hasPass: boolean;
  configured: boolean;
}

export default function AdminEmailSettings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showPass, setShowPass] = useState(false);

  const [form, setForm] = useState({
    recipientEmail: "",
    smtpHost: "",
    smtpPort: "587",
    smtpUser: "",
    smtpPass: "",
    smtpEncryption: "tls" as SmtpEncryption,
  });

  const { data, isLoading } = useQuery<EmailSettings>({
    queryKey: ["admin-email-settings"],
    queryFn: () => customFetch("/api/admin/email-settings"),
  });

  useEffect(() => {
    if (data) {
      setForm((f) => ({
        ...f,
        recipientEmail: data.recipientEmail || "",
        smtpHost: data.smtpHost || "",
        smtpPort: data.smtpPort || "587",
        smtpUser: data.smtpUser || "",
        smtpEncryption: data.smtpEncryption || "tls",
      }));
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      customFetch("/api/admin/email-settings", {
        method: "PUT",
        body: JSON.stringify(form),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-email-settings"] });
      toast({ title: "Email settings saved" });
      setForm((f) => ({ ...f, smtpPass: "" }));
    },
    onError: () => toast({ title: "Failed to save email settings", variant: "destructive" }),
  });

  const testMutation = useMutation({
    mutationFn: () =>
      customFetch("/api/admin/email-settings/test", { method: "POST" }),
    onSuccess: () => toast({ title: "Test email sent! Check your inbox." }),
    onError: (err: any) =>
      toast({ title: "Test failed", description: err?.message ?? "Check your SMTP settings", variant: "destructive" }),
  });

  const set = (key: keyof typeof form, val: string) =>
    setForm((f) => ({ ...f, [key]: val }));

  if (isLoading) return null;

  return (
    <Card className="bg-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="w-5 h-5 text-blue-400" />
          Email Notifications
        </CardTitle>
        <CardDescription>
          Receive an email whenever a customer submits a new problem.
          {data?.configured && (
            <span className="ml-2 inline-flex items-center gap-1 text-emerald-400 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />Active
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Hint */}
        <div className="flex gap-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-xs text-blue-300">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            For Gmail, use <strong>smtp.gmail.com</strong>, port <strong>587</strong>, and an{" "}
            <a
              href="https://myaccount.google.com/apppasswords"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              App Password
            </a>{" "}
            (not your regular password).
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="text-xs text-muted-foreground font-medium mb-1 block">
              Recipient Email <span className="text-destructive">*</span>
            </label>
            <Input
              placeholder="admin@example.com"
              value={form.recipientEmail}
              onChange={(e) => set("recipientEmail", e.target.value)}
              className="bg-background"
              type="email"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="text-xs text-muted-foreground font-medium mb-1 block">
              SMTP Host <span className="text-destructive">*</span>
            </label>
            <Input
              placeholder="smtp.gmail.com"
              value={form.smtpHost}
              onChange={(e) => set("smtpHost", e.target.value)}
              className="bg-background font-mono text-sm"
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground font-medium mb-1 block">Port</label>
            <Input
              placeholder="587"
              value={form.smtpPort}
              onChange={(e) => set("smtpPort", e.target.value)}
              className="bg-background"
              type="number"
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground font-medium mb-1 block">SMTP Encryption</label>
            <Select
              value={form.smtpEncryption}
              onValueChange={(v) => set("smtpEncryption", v as SmtpEncryption)}
            >
              <SelectTrigger className="bg-background">
                <SelectValue placeholder="Select encryption" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tls">TLS</SelectItem>
                <SelectItem value="ssl">SSL</SelectItem>
                <SelectItem value="none">None</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs text-muted-foreground font-medium mb-1 block">
              SMTP Username <span className="text-destructive">*</span>
            </label>
            <Input
              placeholder="you@gmail.com"
              value={form.smtpUser}
              onChange={(e) => set("smtpUser", e.target.value)}
              className="bg-background"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="text-xs text-muted-foreground font-medium mb-1 block">
              SMTP Password / App Password{" "}
              {data?.hasPass && !form.smtpPass && (
                <span className="text-emerald-400 ml-1">(saved)</span>
              )}
            </label>
            <div className="relative">
              <Input
                type={showPass ? "text" : "password"}
                placeholder={data?.hasPass ? "Enter new password to replace…" : "••••••••"}
                value={form.smtpPass}
                onChange={(e) => set("smtpPass", e.target.value)}
                className="bg-background pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        <div className="flex gap-2 pt-1 flex-wrap">
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={!form.recipientEmail.trim() || !form.smtpHost.trim() || !form.smtpUser.trim() || saveMutation.isPending}
          >
            {saveMutation.isPending ? "Saving…" : "Save Settings"}
          </Button>
          {data?.configured && (
            <Button
              variant="outline"
              onClick={() => testMutation.mutate()}
              disabled={testMutation.isPending}
            >
              {testMutation.isPending ? "Sending…" : "Send Test Email"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
