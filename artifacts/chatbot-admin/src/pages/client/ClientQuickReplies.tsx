import { useState } from "react";
import { useLanguage } from "@/hooks/use-language";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Trash2, MessageSquarePlus, Loader2, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";

export interface CannedResponse {
  id: number;
  companyId: number;
  title: string;
  content: string;
}

export default function ClientQuickReplies() {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const { data: responses = [], isLoading } = useQuery({
    queryKey: ["canned-responses"],
    queryFn: async () => {
      const res = await customFetch("/client/canned-responses");
      if (!res.ok) throw new Error("Failed to fetch");
      return (await res.json()) as CannedResponse[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await customFetch("/client/canned-responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content }),
      });
      if (!res.ok) throw new Error("Failed to create");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["canned-responses"] });
      setTitle("");
      setContent("");
      toast({ title: lang === "ar" ? "تمت الإضافة" : "Added successfully" });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await customFetch(\`/client/canned-responses/\${id}\`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["canned-responses"] });
      toast({ title: lang === "ar" ? "تم الحذف" : "Deleted successfully" });
    }
  });

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-4 md:p-6 lg:p-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <Zap className="w-8 h-8 text-primary" />
          {lang === "ar" ? "الردود السريعة (القوالب)" : "Quick Replies"}
        </h1>
        <p className="text-muted-foreground">
          {lang === "ar" 
            ? "قم بإنشاء قوالب للرسائل المتكررة لاستخدامها فوراً في المحادثة الشاملة بكتابة رمز /" 
            : "Create templates for frequently used messages. Type / in the Universal Chat to use them."}
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Form */}
        <Card className="md:col-span-1 h-fit">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <MessageSquarePlus className="w-5 h-5 text-primary" />
              {lang === "ar" ? "إضافة رد جديد" : "Add New Reply"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">{lang === "ar" ? "عنوان الاختصار (مثال: ترحيب)" : "Shortcut Title (e.g., greeting)"}</label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={lang === "ar" ? "ترحيب" : "welcome"} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{lang === "ar" ? "محتوى الرسالة" : "Message Content"}</label>
              <Textarea 
                value={content} 
                onChange={(e) => setContent(e.target.value)} 
                placeholder={lang === "ar" ? "أهلاً بك، كيف يمكنني مساعدتك اليوم؟" : "Hello, how can I help you today?"}
                className="min-h-[120px]"
              />
            </div>
            <Button 
              className="w-full" 
              onClick={() => createMutation.mutate()} 
              disabled={!title.trim() || !content.trim() || createMutation.isPending}
            >
              {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {lang === "ar" ? "حفظ القالب" : "Save Template"}
            </Button>
          </CardContent>
        </Card>

        {/* List */}
        <div className="md:col-span-2 space-y-4">
          {isLoading ? (
            <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
          ) : responses.length === 0 ? (
            <Card className="bg-muted/30 border-dashed">
              <CardContent className="flex flex-col items-center justify-center p-12 text-center gap-3">
                <Zap className="w-12 h-12 text-muted-foreground/30" />
                <p className="text-lg font-medium text-muted-foreground">
                  {lang === "ar" ? "لا توجد قوالب محفوظة" : "No templates saved yet"}
                </p>
                <p className="text-sm text-muted-foreground/80 max-w-sm">
                  {lang === "ar" ? "أضف ردك السريع الأول من القائمة لتسريع استجابتك للعملاء." : "Add your first quick reply from the form to speed up customer responses."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {responses.map((res) => (
                <Card key={res.id}>
                  <CardContent className="p-4 flex gap-4 items-start justify-between group">
                    <div className="space-y-1 overflow-hidden">
                      <div className="font-semibold text-primary flex items-center gap-2">
                        <span className="bg-primary/10 px-2 py-0.5 rounded text-sm">/{res.title}</span>
                      </div>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{res.content}</p>
                    </div>
                    <ConfirmDeleteDialog onConfirm={() => deleteMutation.mutate(res.id)}>
                      <Button variant="ghost" size="icon" className="text-destructive opacity-50 group-hover:opacity-100 shrink-0">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </ConfirmDeleteDialog>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
