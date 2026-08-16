import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  MessageCircle, Send, Loader2, Check, AlertTriangle,
  Zap, Copy, Layers,
} from "lucide-react";
import {
  useGetClientCompany,
  useUpdateClientCompany,
  getGetClientCompanyQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import { ChannelIcon } from "@/components/ChannelIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Switch } from "@/components/ui/switch";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

const formSchema = z.object({
  telegramBotApiKey:         z.string().optional().or(z.literal("")),
  whatsappApiToken:          z.string().optional().or(z.literal("")),
  whatsappPhoneNumberId:     z.string().optional().or(z.literal("")),
  whatsappBusinessAccountId: z.string().optional().or(z.literal("")),
  whatsappNumber:            z.string().optional().or(z.literal("")),
  messengerApiKey:           z.string().optional().or(z.literal("")),
  messengerPageId:           z.string().optional().or(z.literal("")),
  websiteChatbotKey:         z.string().optional().or(z.literal("")),
  fabEnabled:                z.boolean().optional(),
  fabPositionX:              z.number().min(0).max(100).optional(),
  fabPositionY:              z.number().min(0).max(100).optional(),
});

type FormValues = z.infer<typeof formSchema>;
const DEFAULT_FAB_POSITION = { x: 96, y: 92 };
const FAB_POSITION_LIMITS = { minX: 4, maxX: 96, minY: 6, maxY: 94 };

/* ── small status badge ─────────────────────────────────────── */
function ChannelBadge({ active }: { active: boolean }) {
  return active ? (
    <Badge className="ml-auto mr-2 gap-1 bg-emerald-500/15 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/20 text-[10px] py-0.5">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" /> Connected
    </Badge>
  ) : (
    <Badge variant="outline" className="ml-auto mr-2 text-[10px] py-0.5 text-muted-foreground">
      Not configured
    </Badge>
  );
}

export default function ClientChannels() {
  const { data: company, isLoading } = useGetClientCompany();
  const updateCompany = useUpdateClientCompany();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const initialized = useRef(false);

  /* ── master switches (UI-only, control field visibility) ─── */
  const [telegramOn,  setTelegramOn]  = useState(false);
  const [whatsappOn,  setWhatsappOn]  = useState(false);
  const [messengerOn, setMessengerOn] = useState(false);
  const [widgetOn,    setWidgetOn]    = useState(false);
  const fabPreviewRef = useRef<HTMLDivElement>(null);
  const [draggingFab, setDraggingFab] = useState(false);

  /* ── Telegram webhook helpers ────────────────────────────── */
  const [tgRegistering, setTgRegistering] = useState(false);
  const [tgStatus, setTgStatus] = useState<{ ok: boolean; message: string } | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      telegramBotApiKey:         "",
      whatsappApiToken:          "",
      whatsappPhoneNumberId:     "",
      whatsappBusinessAccountId: "",
      whatsappNumber:            "",
      messengerApiKey:           "",
      messengerPageId:           "",
      websiteChatbotKey:         "",
      fabEnabled:                false,
      fabPositionX:              DEFAULT_FAB_POSITION.x,
      fabPositionY:              DEFAULT_FAB_POSITION.y,
    },
  });

  useEffect(() => {
    if (company && !initialized.current) {
      form.reset({
        telegramBotApiKey:         company.telegramBotApiKey         ?? "",
        whatsappApiToken:          company.whatsappApiToken          ?? "",
        whatsappPhoneNumberId:     company.whatsappPhoneNumberId     ?? "",
        whatsappBusinessAccountId: company.whatsappBusinessAccountId ?? "",
        whatsappNumber:            company.whatsappNumber            ?? "",
        messengerApiKey:           company.messengerApiKey           ?? "",
        messengerPageId:           company.messengerPageId           ?? "",
        websiteChatbotKey:         company.websiteChatbotKey         ?? "",
        fabEnabled:                company.fabEnabled                ?? false,
        fabPositionX:              company.fabPositionX              ?? DEFAULT_FAB_POSITION.x,
        fabPositionY:              company.fabPositionY              ?? DEFAULT_FAB_POSITION.y,
      });
      /* auto-enable switch if channel already has credentials */
      if (company.telegramBotApiKey)  setTelegramOn(true);
      if (company.whatsappApiToken)   setWhatsappOn(true);
      if (company.messengerApiKey)    setMessengerOn(true);
      if (company.websiteChatbotKey)  setWidgetOn(true);
      initialized.current = true;
    }
  }, [company, form]);

  const isSaving = updateCompany.isPending;

  const onSubmit = (values: FormValues) => {
    const data = {
      name:                      company?.name ?? "",
      telegramBotApiKey:         values.telegramBotApiKey         || null,
      whatsappApiToken:          values.whatsappApiToken          || null,
      whatsappPhoneNumberId:     values.whatsappPhoneNumberId     || null,
      whatsappBusinessAccountId: values.whatsappBusinessAccountId || null,
      whatsappNumber:            values.whatsappNumber            || null,
      messengerApiKey:           values.messengerApiKey           || null,
      messengerPageId:           values.messengerPageId           || null,
      websiteChatbotKey:         values.websiteChatbotKey         || null,
      fabEnabled:                values.fabEnabled                ?? false,
      fabPositionX:              values.fabPositionX              ?? DEFAULT_FAB_POSITION.x,
      fabPositionY:              values.fabPositionY              ?? DEFAULT_FAB_POSITION.y,
    };
    updateCompany.mutate({ data }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetClientCompanyQueryKey() });
        toast({ title: "Channels saved successfully" });
      },
      onError: (error: any) => {
        toast({ title: "Failed to save", description: error.message, variant: "destructive" });
      },
    });
  };

  const fabPositionX = form.watch("fabPositionX") ?? DEFAULT_FAB_POSITION.x;
  const fabPositionY = form.watch("fabPositionY") ?? DEFAULT_FAB_POSITION.y;

  const updateFabPosition = (clientX: number, clientY: number) => {
    const preview = fabPreviewRef.current;
    if (!preview) return;
    const bounds = preview.getBoundingClientRect();
    const x = Math.round(((clientX - bounds.left) / bounds.width) * 100);
    const y = Math.round(((clientY - bounds.top) / bounds.height) * 100);
    form.setValue("fabPositionX", Math.min(FAB_POSITION_LIMITS.maxX, Math.max(FAB_POSITION_LIMITS.minX, x)), {
      shouldDirty: true,
    });
    form.setValue("fabPositionY", Math.min(FAB_POSITION_LIMITS.maxY, Math.max(FAB_POSITION_LIMITS.minY, y)), {
      shouldDirty: true,
    });
  };

  const moveFabByKeyboard = (event: KeyboardEvent<HTMLButtonElement>) => {
    const step = event.shiftKey ? 5 : 1;
    let nextX = fabPositionX;
    let nextY = fabPositionY;
    if (event.key === "ArrowLeft") nextX -= step;
    if (event.key === "ArrowRight") nextX += step;
    if (event.key === "ArrowUp") nextY -= step;
    if (event.key === "ArrowDown") nextY += step;
    if (nextX !== fabPositionX || nextY !== fabPositionY) {
      event.preventDefault();
      form.setValue("fabPositionX", Math.min(FAB_POSITION_LIMITS.maxX, Math.max(FAB_POSITION_LIMITS.minX, nextX)), { shouldDirty: true });
      form.setValue("fabPositionY", Math.min(FAB_POSITION_LIMITS.maxY, Math.max(FAB_POSITION_LIMITS.minY, nextY)), { shouldDirty: true });
    }
  };

  const registerTelegramWebhook = async () => {
    if (!company?.telegramBotApiKey) return;
    setTgRegistering(true);
    setTgStatus(null);
    const webhookUrl = `${window.location.origin}/api/telegram/webhook/${company.telegramBotApiKey}`;
    try {
      const res = await fetch(`/api/telegram/register-webhook/${company.telegramBotApiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookUrl }),
      });
      const data = await res.json();
      setTgStatus(res.ok
        ? { ok: true,  message: "✅ Webhook registered! Telegram will now send messages to your chatbot." }
        : { ok: false, message: `❌ ${data.error}` });
    } catch {
      setTgStatus({ ok: false, message: "❌ Connection error. Check your bot token and try again." });
    } finally {
      setTgRegistering(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-2xl">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl pb-12">

      {/* ── Header ───────────────────────────────────────────── */}
      <div className="space-y-1">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <MessageCircle className="w-4.5 h-4.5 text-primary" />
          </div>
          <h1 className="text-xl font-semibold">Channels</h1>
        </div>
        <p className="text-sm text-muted-foreground pl-11.5">
          Configure messaging channels for your AI chatbot. Enable a channel by toggling its switch on, then fill in the credentials.
        </p>
      </div>

      {/* ── Form ─────────────────────────────────────────────── */}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

          <Accordion type="multiple" defaultValue={["telegram","whatsapp","messenger"]} className="space-y-3">

            {/* ══ TELEGRAM ══════════════════════════════════════ */}
            <AccordionItem value="telegram" className="bg-card border border-border/50 rounded-xl px-1 overflow-hidden">
              <AccordionTrigger className="hover:no-underline px-4 py-4 [&>svg]:ml-0">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <ChannelIcon channel="telegram" size={22} />
                  <span className="font-semibold">Telegram</span>
                  <ChannelBadge active={!!company?.telegramBotApiKey} />
                  {/* master switch — stopPropagation so accordion doesn't toggle */}
                  <div
                    className="shrink-0"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <Switch
                      checked={telegramOn}
                      onCheckedChange={setTelegramOn}
                      aria-label="Enable Telegram channel"
                    />
                  </div>
                </div>
              </AccordionTrigger>

              <AccordionContent className="px-4 pb-5 space-y-4">
                {!telegramOn ? (
                  <p className="text-sm text-muted-foreground py-2">
                    Toggle the switch above to configure your Telegram bot.
                  </p>
                ) : (
                  <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                    <FormField
                      control={form.control}
                      name="telegramBotApiKey"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Telegram Bot Token</FormLabel>
                          <FormControl>
                            <PasswordInput
                              {...field}
                              className="bg-background"
                              placeholder="110201543:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw"
                            />
                          </FormControl>
                          <FormDescription className="text-[11px]">
                            Create a bot via <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-primary underline hover:no-underline">@BotFather</a> on Telegram and paste the token here.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Webhook registration (only when token already saved) */}
                    {company?.telegramBotApiKey && (
                      <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-4 space-y-3">
                        <p className="text-xs font-semibold text-sky-600 dark:text-sky-400 flex items-center gap-1.5">
                          <Zap className="w-3.5 h-3.5" /> Webhook Registration
                        </p>
                        {!company.isActive && (
                          <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            Activate your account first before registering.
                          </div>
                        )}
                        <div className="space-y-1">
                          <p className="text-[11px] font-medium text-muted-foreground">Your webhook URL</p>
                          <div className="relative group">
                            <pre className="bg-background/80 border border-border rounded-lg px-3 py-2 font-mono text-[11px] overflow-x-auto">
                              {`${window.location.origin}/api/telegram/webhook/${company.telegramBotApiKey}`}
                            </pre>
                            <button
                              type="button"
                              className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity rounded px-2 py-1 text-[10px] bg-muted border border-border hover:bg-accent"
                              onClick={() => {
                                navigator.clipboard.writeText(`${window.location.origin}/api/telegram/webhook/${company.telegramBotApiKey}`);
                                toast({ title: "Copied!" });
                              }}
                            >
                              <Copy className="w-3 h-3 inline mr-1" />Copy
                            </button>
                          </div>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          onClick={registerTelegramWebhook}
                          disabled={tgRegistering || !company.isActive}
                          className="bg-sky-500 hover:bg-sky-600 text-white gap-2 h-8"
                        >
                          {tgRegistering
                            ? <><span className="animate-spin inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full" /> Registering…</>
                            : <><Zap className="w-3.5 h-3.5" /> Register Webhook</>}
                        </Button>
                        {tgStatus && (
                          <p className={`text-xs rounded-lg border px-3 py-2 ${tgStatus.ok ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400" : "border-red-500/30 bg-red-500/5 text-red-600 dark:text-red-400"}`}>
                            {tgStatus.message}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>

            {/* ══ WHATSAPP ══════════════════════════════════════ */}
            <AccordionItem value="whatsapp" className="bg-card border border-border/50 rounded-xl px-1 overflow-hidden">
              <AccordionTrigger className="hover:no-underline px-4 py-4 [&>svg]:ml-0">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <ChannelIcon channel="whatsapp" size={22} />
                  <span className="font-semibold">WhatsApp</span>
                  <ChannelBadge active={!!company?.whatsappApiToken} />
                  <div
                    className="shrink-0"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <Switch
                      checked={whatsappOn}
                      onCheckedChange={setWhatsappOn}
                      aria-label="Enable WhatsApp channel"
                    />
                  </div>
                </div>
              </AccordionTrigger>

              <AccordionContent className="px-4 pb-5 space-y-4">
                {!whatsappOn ? (
                  <p className="text-sm text-muted-foreground py-2">
                    Toggle the switch above to configure your WhatsApp Business account.
                  </p>
                ) : (
                  <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                    <FormField
                      control={form.control}
                      name="whatsappApiToken"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>WhatsApp API Token</FormLabel>
                          <FormControl>
                            <PasswordInput {...field} className="bg-background" placeholder="••••••••" />
                          </FormControl>
                          <FormDescription className="text-[11px]">
                            Permanent access token from Meta Business → WhatsApp → API Setup.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid sm:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="whatsappPhoneNumberId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Phone Number ID</FormLabel>
                            <FormControl>
                              <Input {...field} className="bg-background" placeholder="123456789012345" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="whatsappBusinessAccountId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Business Account ID</FormLabel>
                            <FormControl>
                              <Input {...field} className="bg-background" placeholder="987654321098765" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={form.control}
                      name="whatsappNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>WhatsApp Number</FormLabel>
                          <FormControl>
                            <Input {...field} className="bg-background" placeholder="15551234567" />
                          </FormControl>
                          <FormDescription className="text-[11px]">
                            International format, digits only (e.g. 15551234567). Used to build your <code className="bg-muted px-1 rounded">wa.me</code> share link.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>

            {/* ══ MESSENGER ═════════════════════════════════════ */}
            <AccordionItem value="messenger" className="bg-card border border-border/50 rounded-xl px-1 overflow-hidden">
              <AccordionTrigger className="hover:no-underline px-4 py-4 [&>svg]:ml-0">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <ChannelIcon channel="messenger" size={22} />
                  <span className="font-semibold">Messenger</span>
                  <ChannelBadge active={!!company?.messengerApiKey} />
                  <div
                    className="shrink-0"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <Switch
                      checked={messengerOn}
                      onCheckedChange={setMessengerOn}
                      aria-label="Enable Messenger channel"
                    />
                  </div>
                </div>
              </AccordionTrigger>

              <AccordionContent className="px-4 pb-5 space-y-4">
                {!messengerOn ? (
                  <p className="text-sm text-muted-foreground py-2">
                    Toggle the switch above to configure your Facebook Messenger page.
                  </p>
                ) : (
                  <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                    <FormField
                      control={form.control}
                      name="messengerApiKey"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Page Access Token</FormLabel>
                          <FormControl>
                            <PasswordInput {...field} className="bg-background" placeholder="••••••••" />
                          </FormControl>
                          <FormDescription className="text-[11px]">
                            Generated in Meta for Developers → your App → Messenger → Settings → Access Tokens.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="messengerPageId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Page ID</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              className="bg-background"
                              placeholder="Auto-fetched when token is saved"
                            />
                          </FormControl>
                          <FormDescription className="text-[11px]">
                            Populated automatically from Meta when the Page Access Token is saved. Override only if needed.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>

            {/* ══ WEBSITE WIDGET ════════════════════════════════ */}
            <AccordionItem value="widget" className="bg-card border border-border/50 rounded-xl px-1 overflow-hidden">
              <AccordionTrigger className="hover:no-underline px-4 py-4 [&>svg]:ml-0">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <ChannelIcon channel="widget" size={22} />
                  <span className="font-semibold">Website Widget</span>
                  <ChannelBadge active={!!company?.websiteChatbotKey} />
                  <div
                    className="shrink-0"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <Switch
                      checked={widgetOn}
                      onCheckedChange={(checked) => {
                        setWidgetOn(checked);
                        if (checked && !form.getValues("websiteChatbotKey")) {
                          form.setValue("websiteChatbotKey", crypto.randomUUID());
                        }
                      }}
                      aria-label="Enable Website Widget channel"
                    />
                  </div>
                </div>
              </AccordionTrigger>

              <AccordionContent className="px-4 pb-5 space-y-4">
                {!widgetOn ? (
                  <p className="text-sm text-muted-foreground py-2">
                    Toggle the switch above to configure your website chat widget.
                  </p>
                ) : (
                  <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                    <FormField
                      control={form.control}
                      name="websiteChatbotKey"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Website Widget Key</FormLabel>
                          <FormControl>
                            <PasswordInput {...field} className="bg-background" placeholder="••••••••" />
                          </FormControl>
                          <FormDescription className="text-[11px]">
                            Embed this key in the widget script on your website so visitors can chat with your AI agent.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>

          </Accordion>

          {/* ── Floating Action Button ───────────────────────── */}
          <div className="rounded-xl border border-border/50 bg-card px-4 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1 flex-1">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-primary shrink-0" />
                  <span className="font-semibold text-sm">Enable Floating Action Button</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed pl-6">
                  Adds a floating button to your website that expands to show all active channel icons. The embed snippet in the Company tab updates automatically to include the FAB code.
                </p>
              </div>
              <FormField
                control={form.control}
                name="fabEnabled"
                render={({ field }) => (
                  <FormItem className="flex-shrink-0 pt-0.5">
                    <FormControl>
                      <Switch
                        checked={!!field.value}
                        onCheckedChange={field.onChange}
                        aria-label="Enable Floating Action Button"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <input type="hidden" {...form.register("fabPositionX", { valueAsNumber: true })} />
            <input type="hidden" {...form.register("fabPositionY", { valueAsNumber: true })} />

            {form.watch("fabEnabled") && (
              <div className="mt-5 space-y-3 border-t border-border/40 pt-5">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">Choose button placement</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Drag the button inside the website preview. This position will be used by the live embed.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => {
                      form.setValue("fabPositionX", DEFAULT_FAB_POSITION.x, { shouldDirty: true });
                      form.setValue("fabPositionY", DEFAULT_FAB_POSITION.y, { shouldDirty: true });
                    }}
                  >
                    Reset position
                  </Button>
                </div>

                <div
                  ref={fabPreviewRef}
                  className="relative h-64 overflow-hidden rounded-xl border border-border/60 bg-slate-100 shadow-inner dark:bg-slate-950"
                  aria-label="Website preview for positioning the floating action button"
                >
                  <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(to_right,rgba(100,116,139,.18)_1px,transparent_1px),linear-gradient(to_bottom,rgba(100,116,139,.18)_1px,transparent_1px)] [background-size:28px_28px]" />
                  <div className="absolute inset-x-0 top-0 flex h-9 items-center gap-1.5 border-b border-slate-300/70 bg-white/75 px-3 dark:border-slate-700/70 dark:bg-slate-900/75">
                    <span className="h-2 w-2 rounded-full bg-red-400/80" />
                    <span className="h-2 w-2 rounded-full bg-amber-400/80" />
                    <span className="h-2 w-2 rounded-full bg-emerald-400/80" />
                    <span className="ml-2 h-2 w-24 rounded-full bg-slate-300/70 dark:bg-slate-700/70" />
                  </div>
                  <div className="absolute inset-x-8 top-20 space-y-3">
                    <div className="h-3 w-2/5 rounded-full bg-slate-300/70 dark:bg-slate-700/70" />
                    <div className="h-2 w-4/5 rounded-full bg-slate-200/80 dark:bg-slate-800/80" />
                    <div className="h-2 w-3/5 rounded-full bg-slate-200/80 dark:bg-slate-800/80" />
                  </div>
                  <button
                    type="button"
                    className={`absolute z-10 flex h-14 w-14 touch-none select-none items-center justify-center rounded-full border-0 bg-violet-600 shadow-[0_8px_24px_rgba(124,58,237,.45)] transition-shadow ${
                      draggingFab ? "cursor-grabbing shadow-[0_12px_30px_rgba(124,58,237,.65)]" : "cursor-grab"
                    }`}
                    style={{
                      left: `clamp(52px, ${fabPositionX}%, calc(100% - 52px))`,
                      top: `clamp(52px, ${fabPositionY}%, calc(100% - 52px))`,
                      transform: "translate(-50%, -50%)",
                    }}
                    aria-label="Drag to choose the floating button position"
                    aria-roledescription="draggable button"
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.currentTarget.setPointerCapture(event.pointerId);
                      setDraggingFab(true);
                      updateFabPosition(event.clientX, event.clientY);
                    }}
                    onPointerMove={(event) => {
                      if (draggingFab) updateFabPosition(event.clientX, event.clientY);
                    }}
                    onPointerUp={(event) => {
                      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                        event.currentTarget.releasePointerCapture(event.pointerId);
                      }
                      setDraggingFab(false);
                    }}
                    onPointerCancel={() => setDraggingFab(false)}
                    onKeyDown={moveFabByKeyboard}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="27" height="27" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <div className="absolute bottom-3 left-3 rounded-md bg-background/80 px-2 py-1 text-[10px] text-muted-foreground backdrop-blur-sm">
                    Drag anywhere within the preview
                  </div>
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Horizontal: {fabPositionX}%</span>
                  <span>Vertical: {fabPositionY}%</span>
                </div>
              </div>
            )}
          </div>

          {/* ── Sticky Save ──────────────────────────────────── */}
          <div className="flex justify-end pt-2 sticky bottom-6 z-10">
            <div className="bg-background/80 backdrop-blur-md p-2 rounded-full border border-border shadow-lg inline-block">
              <Button
                type="submit"
                size="lg"
                className="px-8 rounded-full shadow-[0_0_15px_rgba(var(--primary),0.3)]"
                disabled={isSaving}
              >
                {isSaving ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</>
                ) : (
                  <><Check className="w-4 h-4 mr-2" /> Save Channels</>
                )}
              </Button>
            </div>
          </div>

        </form>
      </Form>

      {/* ── Info row ─────────────────────────────────────────── */}
      <div className="rounded-lg border border-border/40 bg-muted/20 p-4 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
          <Send className="w-3.5 h-3.5" /> Channel status
        </p>
        <div className="grid grid-cols-4 gap-3 text-center text-xs">
          {[
            { channel: "telegram" as const, label: "Telegram",  active: !!company?.telegramBotApiKey,  color: "sky" },
            { channel: "whatsapp" as const, label: "WhatsApp",  active: !!company?.whatsappApiToken,   color: "green" },
            { channel: "messenger" as const, label: "Messenger", active: !!company?.messengerApiKey,    color: "blue" },
            { channel: "widget" as const,    label: "Widget",    active: !!company?.websiteChatbotKey,  color: "violet" },
          ].map(({ channel, label, active, color }) => (
            <div
              key={label}
              className={`rounded-lg border p-2.5 space-y-1 transition-colors ${
                active
                  ? `border-${color}-500/40 bg-${color}-500/5`
                  : "border-border/40 bg-background"
              }`}
            >
              <div className="flex justify-center"><ChannelIcon channel={channel} size={20} /></div>
              <div className="font-medium">{label}</div>
              <div className={`text-[10px] ${active ? `text-${color}-500` : "text-muted-foreground"}`}>
                {active ? "✓ Active" : "Not set"}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
