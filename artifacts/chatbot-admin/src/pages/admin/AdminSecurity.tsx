import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { ShieldCheck, KeyRound, RotateCcw, Eye, EyeOff, Copy, Check, AlertTriangle, Webhook, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface JwtSecretInfo {
  exists: boolean;
  maskedSecret: string | null;
  lastRotated: string | null;
}

interface WebhookTokenInfo {
  webhookUrl: string;
  verifyToken: string | null;
  updatedAt: string | null;
}

interface RotateResult {
  success: boolean;
  maskedSecret: string;
  secret: string;
  lastRotated: string;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "1 day ago" : `${d} days ago`;
}

function WebhookTokenCard({
  title,
  icon,
  description,
  queryKey,
  fetchUrl,
  generateUrl,
}: {
  title: string;
  icon: string;
  description: string;
  queryKey: string;
  fetchUrl: string;
  generateUrl: string;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);

  const { data, isLoading } = useQuery<WebhookTokenInfo>({
    queryKey: [queryKey],
    queryFn: () => customFetch(fetchUrl),
  });

  const generate = useMutation<{ verifyToken: string }>({
    mutationFn: () => customFetch(generateUrl, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [queryKey] });
      toast({ title: `${title} token generated`, description: "The new verify token is now active." });
    },
    onError: () => {
      toast({ title: "Generation failed", description: "Could not generate a token.", variant: "destructive" });
    },
  });

  const handleCopy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className="bg-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-base">{icon}</span>
            <CardTitle className="text-base">{title} Verify Token</CardTitle>
          </div>
          {data?.verifyToken && (
            <Badge variant="outline" className="text-emerald-400 border-emerald-500/30 bg-emerald-500/10 text-xs">
              Active
            </Badge>
          )}
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="h-11 rounded-md bg-muted animate-pulse" />
        ) : (
          <>
            {/* Webhook URL */}
            {data?.webhookUrl && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Webhook URL</p>
                <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/50 border border-border font-mono text-xs overflow-hidden">
                  <span className="flex-1 truncate">{data.webhookUrl}</span>
                </div>
              </div>
            )}

            {/* Verify Token */}
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Verify Token</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-md bg-muted/50 border border-border font-mono text-xs overflow-hidden">
                  {data?.verifyToken ? (
                    <span className="flex-1 truncate select-all">{data.verifyToken}</span>
                  ) : (
                    <span className="flex-1 text-muted-foreground font-sans">No token yet — click Generate.</span>
                  )}
                </div>
                {data?.verifyToken && (
                  <Button type="button" variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-foreground"
                    onClick={() => handleCopy(data.verifyToken!)} title="Copy token">
                    {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </Button>
                )}
              </div>
            </div>

            {/* Last generated */}
            {data?.updatedAt && (
              <p className="text-xs text-muted-foreground">
                Last generated: <span className="text-foreground/70">{timeAgo(data.updatedAt)}</span>
                <span className="mx-1 opacity-40">·</span>
                <span className="opacity-50">{new Date(data.updatedAt).toLocaleString()}</span>
              </p>
            )}

            {/* Generate button with confirm */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant={data?.verifyToken ? "outline" : "default"} size="sm" className="gap-2 mt-1" disabled={generate.isPending}>
                  {data?.verifyToken
                    ? <><RefreshCw className={`w-3.5 h-3.5 ${generate.isPending ? "animate-spin" : ""}`} /> Regenerate</>
                    : <><Webhook className="w-3.5 h-3.5" /> Generate Token</>
                  }
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{data?.verifyToken ? "Regenerate" : "Generate"} {title} Verify Token?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {data?.verifyToken
                      ? `A new token will replace the current one. You must update the verify token in your Meta App Dashboard immediately, or webhook verification will fail.`
                      : `A verify token will be generated. Paste it into your Meta App Dashboard when configuring the ${title} webhook.`
                    }
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => generate.mutate()}>
                    {data?.verifyToken ? "Yes, regenerate" : "Generate"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminSecurity() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ── JWT Secret state ──────────────────────────────────────────────────────
  const [revealed, setRevealed] = useState(false);
  const [newSecretPlain, setNewSecretPlain] = useState<string | null>(null);
  const [newSecretRevealed, setNewSecretRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const { data: jwtInfo, isLoading } = useQuery<JwtSecretInfo>({
    queryKey: ["admin-jwt-secret"],
    queryFn: () => customFetch("/api/admin/security/jwt-secret"),
  });

  const rotate = useMutation<RotateResult>({
    mutationFn: () => customFetch("/api/admin/security/jwt-secret/rotate", { method: "POST" }),
    onSuccess: (data) => {
      setNewSecretPlain(data.secret);
      setNewSecretRevealed(false);
      setRevealed(false);
      queryClient.invalidateQueries({ queryKey: ["admin-jwt-secret"] });
      toast({ title: "JWT Secret rotated", description: "A new secret has been generated. Copy it now — it won't be shown again in full." });
    },
    onError: () => {
      toast({ title: "Rotation failed", description: "Could not generate a new secret.", variant: "destructive" });
    },
  });

  const handleCopy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const displayedSecret = newSecretPlain
    ? (newSecretRevealed ? newSecretPlain : (jwtInfo?.maskedSecret ?? "••••••••••••••••••••••••••••••••••••••••"))
    : (revealed ? "Hidden — rotate to reveal the full secret." : (jwtInfo?.maskedSecret ?? "Not set"));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <ShieldCheck className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Security Settings</h1>
          <p className="text-sm text-muted-foreground">Manage signing secrets and security credentials.</p>
        </div>
      </div>

      {/* JWT Secret Card */}
      <Card className="bg-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <KeyRound className="w-4 h-4 text-primary" />
              <CardTitle className="text-base">JWT Secret</CardTitle>
            </div>
            {jwtInfo?.exists && (
              <Badge variant="outline" className="text-emerald-400 border-emerald-500/30 bg-emerald-500/10 text-xs">
                Active
              </Badge>
            )}
          </div>
          <CardDescription>
            A cryptographic secret used to sign and verify tokens. Rotate it periodically or immediately after a suspected compromise. Rotating invalidates all existing signed tokens.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="h-11 rounded-md bg-muted animate-pulse" />
          ) : (
            <>
              {/* Secret display */}
              <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-md bg-muted/50 border border-border font-mono text-sm tracking-wider overflow-hidden">
                  <span className="flex-1 truncate select-all">
                    {newSecretPlain
                      ? (newSecretRevealed ? newSecretPlain : jwtInfo?.maskedSecret ?? "••••••••••••••••••••••••••••••••••••••••")
                      : (jwtInfo?.exists ? jwtInfo.maskedSecret : <span className="text-muted-foreground not-italic font-sans text-xs">No secret yet — click Rotate to generate one.</span>)
                    }
                  </span>
                </div>

                {/* Reveal toggle — only useful right after rotation */}
                {newSecretPlain && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                    onClick={() => setNewSecretRevealed((v) => !v)}
                    title={newSecretRevealed ? "Hide" : "Reveal"}
                  >
                    {newSecretRevealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                )}

                {/* Copy — only available right after rotation */}
                {newSecretPlain && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                    onClick={() => handleCopy(newSecretPlain)}
                    title="Copy to clipboard"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </Button>
                )}
              </div>

              {/* One-time reveal banner */}
              {newSecretPlain && (
                <div className="flex items-start gap-2 p-3 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>This is the only time the full secret is shown. Copy it now and store it securely.</span>
                </div>
              )}

              {/* Last rotated */}
              {jwtInfo?.lastRotated && (
                <p className="text-xs text-muted-foreground">
                  Last rotated: <span className="text-foreground/70">{timeAgo(jwtInfo.lastRotated)}</span>
                  <span className="mx-1 opacity-40">·</span>
                  <span className="opacity-50">{new Date(jwtInfo.lastRotated).toLocaleString()}</span>
                </p>
              )}

              {/* Rotate button */}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant={jwtInfo?.exists ? "outline" : "default"} size="sm" className="gap-2 mt-1" disabled={rotate.isPending}>
                    <RotateCcw className={`w-3.5 h-3.5 ${rotate.isPending ? "animate-spin" : ""}`} />
                    {rotate.isPending ? "Rotating…" : jwtInfo?.exists ? "Rotate Secret" : "Generate Secret"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Rotate JWT Secret?</AlertDialogTitle>
                    <AlertDialogDescription>
                      A new secret will be generated immediately. Any existing signed tokens will become invalid. Make sure downstream services are updated.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => rotate.mutate()}>
                      Yes, rotate
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </CardContent>
      </Card>
      {/* Separator */}
      <Separator className="opacity-40" />

      {/* Webhook Verify Tokens */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Webhook className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold">Webhook Verify Tokens</h2>
          <p className="text-sm text-muted-foreground">Generate tokens to authenticate Meta webhook subscriptions.</p>
        </div>
      </div>

      <WebhookTokenCard
        title="Messenger"
        icon="💬"
        description="Paste this token and the Webhook URL into your Meta App Dashboard under Messenger → Webhooks."
        queryKey="admin-messenger-webhook"
        fetchUrl="/api/admin/messenger-webhook"
        generateUrl="/api/admin/messenger-webhook/generate"
      />

      <WebhookTokenCard
        title="WhatsApp"
        icon="📱"
        description="Paste this token and the Webhook URL into your Meta App Dashboard under WhatsApp → Configuration."
        queryKey="admin-whatsapp-webhook"
        fetchUrl="/api/admin/whatsapp-webhook"
        generateUrl="/api/admin/whatsapp-webhook/generate"
      />
    </div>
  );
}
