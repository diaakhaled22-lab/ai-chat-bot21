import { useForm, Controller } from "react-hook-form";
import { useLanguage } from "@/hooks/use-language";
import { useGetClientCompany, useUpdateClientCompany, customFetch } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Loader2, ShieldCheck, PenTool } from "lucide-react";
import { useEffect } from "react";

type PromptsForm = {
  systemPrompt: string;
};

export default function ClientPrompts() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: company, isLoading } = useGetClientCompany();

  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<PromptsForm>({
    defaultValues: {
      systemPrompt: "",
    },
  });

  useEffect(() => {
    if (company) {
      reset({
        systemPrompt: company.systemPrompt || "",
      });
    }
  }, [company, reset]);

  const updateCompanyMutation = useUpdateClientCompany();

  const onSubmit = (data: PromptsForm) => {
    if (!company) return;
    updateCompanyMutation.mutate(
      { data: { name: company.name, systemPrompt: data.systemPrompt || null } as any },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["getClientCompany"] });
          toast({ title: t("btn_saved") });
        },
        onError: (err: any) => {
          toast({
            title: "Error",
            description: err.message,
            variant: "destructive",
          });
        },
      }
    );
  };

  if (isLoading) {
    return <div className="p-8 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* ── Bot Manager Hero Operations Banner ── */}
      <div
        className="relative overflow-hidden rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-blue-600/15 border border-white/10"
        style={{
          background: "linear-gradient(135deg, #1e40af 0%, #2563eb 50%, #1d4ed8 100%)",
        }}
      >
        <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-white/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute right-40 -top-10 w-48 h-48 bg-blue-300/20 rounded-full blur-xl pointer-events-none" />

        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
          <div className="flex items-center gap-4 sm:gap-5">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white/15 backdrop-blur-md border border-white/25 shadow-[inset_0_0_0_2px_rgba(255,255,255,0.18)] flex items-center justify-center shrink-0">
              <i className="fa-solid fa-pen-nib text-2xl sm:text-3xl text-white"></i>
            </div>
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-[11px] font-semibold text-blue-100 mb-1.5 border border-white/20">
                
                System Persona & Directives
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white leading-tight">
                {t("nav_prompts") || "Prompts & Instructions"}
              </h1>
              <p className="text-xs sm:text-sm text-blue-100/90 mt-1 max-w-xl leading-relaxed">
                Manage your AI agent's instructions, tone of voice, personality, and security boundaries.
              </p>
            </div>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card className="bg-card border border-[#DCE7FF] dark:border-slate-800 rounded-2xl shadow-md shadow-[#2D5BE3]/15 border-l-4 border-l-[#2D5BE3]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PenTool className="w-5 h-5 text-primary" />
              AI Prompts & Instructions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-sm font-semibold mb-1">Custom System Instructions (Prompt)</h2>
            </div>
            <div className="space-y-2">
              <Textarea
                {...register("systemPrompt")}
                className="bg-background min-h-[120px] font-mono text-xs resize-y"
                placeholder={t("company_system_prompt")}
              />
              <p className="text-[10px] text-muted-foreground">
                Define the personality, tone, and specific rules your AI agent should follow. 
                This overrides the default behavior.
              </p>
            </div>
            
            <Separator className="my-6" />

            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className="w-4 h-4 text-indigo-500" />
              <h2 className="text-sm font-semibold mb-1">Custom System Instructions (Prompt) Security</h2>
              <span className="ml-auto text-[10px] uppercase font-bold bg-indigo-500/10 text-indigo-500 px-2 py-0.5 rounded-full">Admin Only</span>
            </div>
            <div className="space-y-2">
              <Textarea
                value={company?.securityPrompt || ""}
                disabled
                className="bg-muted/50 min-h-[120px] font-mono text-xs resize-y opacity-70 cursor-not-allowed"
                placeholder={t("company_security_prompt")}
              />
              <p className="text-[10px] text-muted-foreground">
                Critical security constraints and boundaries. Only administrators can edit this field.
              </p>
            </div>
            
            <div className="pt-4 flex justify-end">
              <Button type="submit" disabled={isSubmitting || updateCompanyMutation.isPending} className="bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md shadow-blue-600/25 px-6">
                {isSubmitting || updateCompanyMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {t("btn_saving")}</>
                ) : (
                  t("btn_save_changes")
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
