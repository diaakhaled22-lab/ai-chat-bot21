import { useForm, Controller } from "react-hook-form";
import { useLanguage } from "@/hooks/useLanguage";
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
      {
        data: {
          systemPrompt: data.systemPrompt,
        },
      },
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("nav_prompts") || "Prompts"}</h1>
          <p className="text-muted-foreground mt-1">
            Manage your AI agent's instructions, personality, and security boundaries.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card className="bg-card border-border/50">
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
              <Button type="submit" disabled={isSubmitting || updateCompanyMutation.isPending}>
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
