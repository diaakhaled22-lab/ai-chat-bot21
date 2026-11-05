import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useState, useEffect } from "react";
import { CreditCard, Smartphone, CheckCircle2, ShieldCheck, Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";

interface PaymentSettings {
  paymentPhone: string;
  paymentInstaPay: string;
}

export default function AdminPaymentSettings() {
  const { lang } = useLanguage();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [form, setForm] = useState({
    paymentPhone: "",
    paymentInstaPay: "",
  });

  const { data, isLoading } = useQuery<PaymentSettings>({
    queryKey: ["admin-payment-settings"],
    queryFn: () => customFetch("/api/admin/payment-settings"),
  });

  useEffect(() => {
    if (data) {
      setForm({
        paymentPhone: data.paymentPhone || "",
        paymentInstaPay: data.paymentInstaPay || "",
      });
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      customFetch("/api/admin/payment-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-payment-settings"] });
      queryClient.invalidateQueries({ queryKey: ["admin-invoices"] });
      toast({
        title: lang === "ar" ? "تم حفظ بيانات السداد بنجاح" : "Payment settings saved",
        description:
          lang === "ar"
            ? "سيتم إظهار هذه البيانات في جميع الفواتير المعلقة ورسائل الواتساب والبريد الإلكتروني."
            : "These details will appear on all unpaid invoices, WhatsApp messages, and emails.",
      });
    },
    onError: (err: any) =>
      toast({
        title: lang === "ar" ? "فشل حفظ بيانات السداد" : "Failed to save payment settings",
        description: err?.message || "",
        variant: "destructive",
      }),
  });

  return (
    <Card className="bg-card border border-[#DCE7FF] dark:border-slate-800 rounded-2xl shadow-md shadow-[#2D5BE3]/15 border-l-4 border-l-[#2D5BE3]">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-primary" />
            {lang === "ar" ? "بيانات السداد للفواتير (إنستاباي والمحافظ)" : "Invoice Payment Details (InstaPay & Wallets)"}
          </CardTitle>
          <div className="flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20 font-medium">
            <ShieldCheck className="w-3.5 h-3.5" />
            {lang === "ar" ? "تظهر في الفواتير غير المسددة" : "Active on Unpaid Invoices"}
          </div>
        </div>
        <CardDescription>
          {lang === "ar"
            ? "تحديد رقم الهاتف وعنوان إنستاباي (IPA) ليتم إرفاقهما تلقائياً في الفاتورة غير المسددة المعلقة المرسلة للعميل عبر الإيميل والواتساب وواجهة النظام."
            : "Configure default payment destination phone number and InstaPay address (IPA) displayed on unpaid invoices sent to clients."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
              <Smartphone className="w-3.5 h-3.5 text-primary" />
              {lang === "ar" ? "رقم الهاتف / فودافون كاش / المحفظة" : "Payment Phone / Cash Wallet"}
            </label>
            <Input
              type="text"
              placeholder={lang === "ar" ? "مثال: 01012345678" : "e.g. 01012345678"}
              value={form.paymentPhone}
              onChange={(e) => setForm((prev) => ({ ...prev, paymentPhone: e.target.value }))}
              className="bg-background font-mono text-sm"
              dir="ltr"
            />
            <p className="text-[11px] text-muted-foreground">
              {lang === "ar"
                ? "الرقم المستخدم لتحويل الأموال عبر المحافظ الإلكترونية كاش."
                : "Number used for wallet transfers (Vodafone Cash, Orange Cash, etc.)"}
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
              <CreditCard className="w-3.5 h-3.5 text-primary" />
              {lang === "ar" ? "عنوان إنستاباي InstaPay IPA" : "InstaPay Address (IPA)"}
            </label>
            <Input
              type="text"
              placeholder={lang === "ar" ? "مثال: username@instapay" : "e.g. username@instapay"}
              value={form.paymentInstaPay}
              onChange={(e) => setForm((prev) => ({ ...prev, paymentInstaPay: e.target.value }))}
              className="bg-background font-mono text-sm"
              dir="ltr"
            />
            <p className="text-[11px] text-muted-foreground">
              {lang === "ar"
                ? "عنوان الحساب اللحظي إنستاباي لتسهيل التحويل المباشر."
                : "Your InstaPay Payment Address (IPA) for instant account transfers."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-700 dark:text-blue-300">
          <Info className="w-4 h-4 shrink-0" />
          <span>
            {lang === "ar"
              ? "ملاحظة: عندما يصدر النظام فاتورة معلقة غير مسددة لأي عميل، سيتضمن إشعار الإيميل والواتساب هذه البيانات مع أزرار نسخ فورية."
              : "Note: When an unpaid pending invoice is generated, these payment credentials will be automatically rendered in the client's email and WhatsApp notifications."}
          </span>
        </div>

        <div className="pt-2">
          <Button
            type="button"
            disabled={saveMutation.isPending || isLoading}
            onClick={() => saveMutation.mutate()}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md shadow-blue-600/25 px-6"
          >
            {saveMutation.isPending
              ? (lang === "ar" ? "جارٍ الحفظ..." : "Saving...")
              : (lang === "ar" ? "حفظ بيانات السداد" : "Save Payment Details")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
