import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Loader2, Globe, CheckCircle2, XCircle, RefreshCw, Trash2,
  ShieldCheck, Info, Plug, RotateCcw, Clock, Database,
} from "lucide-react";
import { customFetch } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";

interface WpIntegration {
  id: number;
  companyId: number;
  apiUrl: string;
  username: string | null;
  hasAppPassword: boolean;
  status: "pending" | "connected" | "error";
  errorMessage: string | null;
  autoSync: boolean;
  lastSynced: string | null;
  totalItems: number;
  createdAt: string;
  updatedAt: string;
}

const formSchema = z.object({
  apiUrl: z
    .string()
    .min(1, "WordPress REST API URL is required")
    .url("Must be a valid URL (e.g. https://yoursite.com/wp-json/)"),
  username: z.string().optional(),
  appPassword: z.string().optional(),
  autoSync: z.boolean().default(true),
});

type FormValues = z.infer<typeof formSchema>;

function StatusBadge({ status }: { status: WpIntegration["status"] }) {
  if (status === "connected") {
    return (
      <Badge className="gap-1 bg-emerald-500/15 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/20">
        <CheckCircle2 className="w-3 h-3" /> Connected
      </Badge>
    );
  }
  if (status === "error") {
    return (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="w-3 h-3" /> Error
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="gap-1">
      <Loader2 className="w-3 h-3 animate-spin" /> Pending
    </Badge>
  );
}

export default function ClientWordPress() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [integration, setIntegration] = useState<WpIntegration | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string; siteName?: string } | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      apiUrl: "",
      username: "",
      appPassword: "",
      autoSync: true,
    },
  });

  // Load current integration on mount
  useEffect(() => {
    customFetch<WpIntegration | null>("/api/client/wordpress")
      .then((data) => {
        setIntegration(data);
        if (data) {
          form.reset({
            apiUrl: data.apiUrl,
            username: data.username ?? "",
            appPassword: "", // never pre-fill password
            autoSync: data.autoSync,
          });
        }
      })
      .catch(() => setLoadError("Failed to load WordPress integration."));
  }, []);

  const handleTest = async () => {
    const values = form.getValues();
    const result = await form.trigger(["apiUrl"]);
    if (!result) return;

    setTesting(true);
    setTestResult(null);
    try {
      const res = await customFetch<{ ok: boolean; error?: string; siteName?: string }>(
        "/api/client/wordpress/test",
        {
          method: "POST",
          body: JSON.stringify({
            apiUrl: values.apiUrl,
            username: values.username || undefined,
            appPassword: values.appPassword || undefined,
          }),
        }
      );
      setTestResult(res);
      if (res.ok) {
        toast({
          title: "Connection successful",
          description: res.siteName ? `Connected to: ${res.siteName}` : "WordPress REST API is reachable.",
        });
      } else {
        toast({
          title: "Connection failed",
          description: res.error ?? "Could not reach the WordPress API.",
          variant: "destructive",
        });
      }
    } catch {
      const msg = "Failed to test connection.";
      setTestResult({ ok: false, error: msg });
      toast({ title: "Test failed", description: msg, variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async (values: FormValues) => {
    setSaving(true);
    try {
      const saved = await customFetch<WpIntegration>("/api/client/wordpress", {
        method: "PUT",
        body: JSON.stringify({
          apiUrl: values.apiUrl,
          username: values.username || undefined,
          appPassword: values.appPassword || undefined,
          autoSync: values.autoSync,
        }),
      });
      setIntegration(saved);
      form.reset({
        apiUrl: saved.apiUrl,
        username: saved.username ?? "",
        appPassword: "",
        autoSync: saved.autoSync,
      });
      setTestResult(null);
      toast({
        title: "WordPress integration saved",
        description: "Content sync started in the background.",
      });
    } catch (err: any) {
      toast({
        title: "Save failed",
        description: err?.message ?? "Could not save WordPress integration.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await customFetch<{ ok: boolean; integration: WpIntegration | null }>(
        "/api/client/wordpress/sync",
        { method: "POST" }
      );
      if (res.integration) setIntegration(res.integration);
      toast({
        title: res.ok ? "Sync complete" : "Sync failed",
        description: res.ok
          ? `Synced ${res.integration?.totalItems ?? 0} items from WordPress.`
          : res.integration?.errorMessage ?? "Sync encountered an error.",
        variant: res.ok ? "default" : "destructive",
      });
    } catch {
      toast({ title: "Sync failed", description: "An error occurred.", variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const handleRemove = async () => {
    if (!window.confirm("Remove the WordPress integration? This will disconnect your site and remove synced content.")) return;
    setRemoving(true);
    try {
      await customFetch("/api/client/wordpress", { method: "DELETE" });
      setIntegration(null);
      form.reset({ apiUrl: "", username: "", appPassword: "", autoSync: true });
      setTestResult(null);
      toast({ title: "Integration removed", description: "WordPress has been disconnected." });
    } catch {
      toast({ title: "Remove failed", description: "Could not remove the integration.", variant: "destructive" });
    } finally {
      setRemoving(false);
    }
  };

  if (integration === undefined) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex items-center justify-center min-h-[300px] text-destructive gap-2">
        <XCircle className="w-5 h-5" /> {loadError}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 p-1">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
              <Globe className="w-4.5 h-4.5 text-blue-500" />
            </div>
            <h1 className="text-xl font-semibold">WordPress Integration</h1>
          </div>
          <p className="text-sm text-muted-foreground pl-11.5">
            Connect your WordPress site so the AI chatbot can answer questions using your pages, posts, categories, and more.
          </p>
        </div>
        {integration && (
          <div className="shrink-0 pt-1">
            <StatusBadge status={integration.status} />
          </div>
        )}
      </div>

      {/* Current connection stats (when connected) */}
      {integration && integration.status === "connected" && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Database className="w-3 h-3" /> Synced Items
            </div>
            <div className="text-2xl font-bold text-emerald-600">{integration.totalItems}</div>
            <div className="text-[10px] text-muted-foreground">pages · posts · categories · tags · media</div>
          </div>
          <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" /> Last Synced
            </div>
            <div className="text-sm font-medium">
              {integration.lastSynced
                ? new Date(integration.lastSynced).toLocaleString()
                : "Not yet synced"}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {integration.autoSync ? "Auto-syncs every 6 hours" : "Manual sync only"}
            </div>
          </div>
        </div>
      )}

      {/* Error state */}
      {integration?.status === "error" && integration.errorMessage && (
        <div className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <div className="font-medium">Sync error</div>
            <div className="text-destructive/80">{integration.errorMessage}</div>
          </div>
        </div>
      )}

      {/* Configuration form */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Plug className="w-4 h-4 text-primary" />
            {integration ? "Update Connection" : "Connect Your WordPress Site"}
          </CardTitle>
          <CardDescription>
            Enter your WordPress REST API URL. Credentials are only needed for private or password-protected content.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSave)} className="space-y-4">

              {/* API URL */}
              <FormField
                control={form.control}
                name="apiUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>WordPress REST API URL <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="https://yoursite.com/wp-json/"
                        className="bg-background font-mono text-sm"
                        autoComplete="off"
                      />
                    </FormControl>
                    <FormDescription className="flex items-start gap-1.5">
                      <Info className="w-3 h-3 shrink-0 mt-0.5 text-muted-foreground" />
                      The URL usually ends with <code className="text-xs bg-muted px-1 rounded">/wp-json/</code>.
                      Test it in your browser — it should return JSON.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Separator />

              {/* Credentials section */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Credentials (optional — for private content)
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>WordPress Username</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="admin" className="bg-background" autoComplete="off" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="appPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Application Password
                          {integration?.hasAppPassword && (
                            <span className="ml-2 text-[10px] text-emerald-600 font-normal">● saved</span>
                          )}
                        </FormLabel>
                        <FormControl>
                          <PasswordInput
                            {...field}
                            placeholder={integration?.hasAppPassword ? "Leave blank to keep current" : "xxxx xxxx xxxx xxxx xxxx xxxx"}
                            className="bg-background"
                            autoComplete="new-password"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Generate an Application Password in WordPress → Users → Profile → Application Passwords.
                  Regular passwords are not accepted.
                </p>
              </div>

              <Separator />

              {/* Auto-sync toggle */}
              <FormField
                control={form.control}
                name="autoSync"
                render={({ field }) => (
                  <FormItem className="flex items-start gap-3 rounded-lg border border-border/50 p-4 bg-muted/20">
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel className="cursor-pointer">Auto-sync every 6 hours</FormLabel>
                      <FormDescription>
                        Keeps the AI knowledge base up to date automatically. You can also sync manually at any time.
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />

              {/* Test result inline */}
              {testResult && (
                <div
                  className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
                    testResult.ok
                      ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700"
                      : "border-destructive/30 bg-destructive/5 text-destructive"
                  }`}
                >
                  {testResult.ok ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  )}
                  <div>
                    {testResult.ok
                      ? testResult.siteName
                        ? `Connected to "${testResult.siteName}" — ready to save.`
                        : "WordPress REST API is reachable — ready to save."
                      : testResult.error ?? "Connection failed."}
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleTest}
                  disabled={testing || saving}
                  className="gap-1.5"
                >
                  {testing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  )}
                  {testing ? "Testing…" : "Test Connection"}
                </Button>

                <Button type="submit" size="sm" disabled={saving || testing} className="gap-1.5">
                  {saving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plug className="w-3.5 h-3.5" />
                  )}
                  {saving ? "Saving…" : integration ? "Update & Re-sync" : "Save & Connect"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Manual sync + disconnect (only when connected) */}
      {integration && (
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Manage Connection</CardTitle>
            <CardDescription>
              Manually trigger a content sync or disconnect this WordPress integration.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSync}
                disabled={syncing}
                className="gap-1.5"
              >
                {syncing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="w-3.5 h-3.5" />
                )}
                {syncing ? "Syncing…" : "Sync Now"}
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRemove}
                disabled={removing}
                className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/5 hover:text-destructive"
              >
                {removing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                {removing ? "Removing…" : "Disconnect WordPress"}
              </Button>
            </div>

            {/* Supported content types info */}
            <div className="rounded-lg border border-border/40 bg-muted/20 p-3 space-y-2">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Synced Content Types
              </div>
              <div className="flex flex-wrap gap-1.5">
                {["Pages", "Posts", "Categories", "Tags", "Media", "Custom Post Types"].map((t) => (
                  <span
                    key={t}
                    className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20"
                  >
                    {t}
                  </span>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                All public content is fetched from the WordPress REST API and indexed for the AI chatbot.
                Private or draft content requires authentication credentials above.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Help card (only when no integration yet) */}
      {!integration && (
        <Card className="border-border/40 bg-muted/10">
          <CardContent className="pt-4 space-y-2">
            <div className="text-sm font-medium flex items-center gap-2">
              <Info className="w-4 h-4 text-muted-foreground" /> How to find your API URL
            </div>
            <ul className="text-sm text-muted-foreground space-y-1 pl-6 list-disc">
              <li>Your WordPress REST API is available at <code className="text-xs bg-muted px-1 rounded">https://yoursite.com/wp-json/</code></li>
              <li>Open that URL in a browser — if you see JSON, it's working.</li>
              <li>Credentials are only needed if your site has private or members-only content.</li>
              <li>For Application Passwords: WordPress Admin → Users → Your Profile → Application Passwords (WordPress 5.6+).</li>
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
