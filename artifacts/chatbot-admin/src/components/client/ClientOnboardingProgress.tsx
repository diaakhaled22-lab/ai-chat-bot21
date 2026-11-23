import { useLanguage } from "@/hooks/use-language";
import { Link } from "wouter";
import { Building2, Package, Check, Lock, Sparkles, Clock, ArrowRight, ArrowLeft, CheckCircle2, Key } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function checkIsCompanyProfileComplete(company: any): boolean {
  if (!company) return false;
  const hasName = typeof company.name === "string" && company.name.trim().length >= 2;
  const hasInfo = typeof company.generalInfo === "string" && company.generalInfo.trim().length >= 3;
  return Boolean(hasName && hasInfo);
}

export function checkIsResendConfigured(company: any, user?: any): boolean {
  const compKey = company?.resendApiKey;
  const userKey = (user as any)?.resendApiKey;
  const key = (typeof compKey === "string" && compKey.trim()) || (typeof userKey === "string" && userKey.trim());
  return Boolean(key && key.length > 3);
}

interface ClientOnboardingProgressProps {
  currentStep: "company" | "settings" | "packages";
  company?: any;
  user?: any;
}

export function ClientOnboardingProgress({ currentStep, company, user }: ClientOnboardingProgressProps) {
  const { lang } = useLanguage();
  const isAr = lang === "ar";

  const isStep1Done = checkIsCompanyProfileComplete(company);
  const isStep2Done = isStep1Done && checkIsResendConfigured(company, user);
  const isStep3Done = Boolean(company?.isActive);

  // Percentage for the continuous progress track
  const progressPercent = isStep3Done ? 100 : isStep2Done ? 66 : isStep1Done ? 33 : 0;

  return (
    <div className="rounded-3xl border border-[#DCE7FF] dark:border-slate-800 bg-card p-5 sm:p-7 shadow-lg shadow-blue-500/5 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-border/50 pb-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-bold mb-1.5 border border-blue-500/20">
            <Sparkles className="w-3.5 h-3.5" />
            <span>{isAr ? "مسار إعداد وتفعيل الحساب" : "Account Setup & Activation Checklist"}</span>
          </div>
          <h2 className="text-lg sm:text-xl font-extrabold text-foreground tracking-tight">
            {isAr ? "خطوات إطلاق المساعد الذكي" : "Steps to Launch Your AI Assistant"}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-xl leading-relaxed">
            {isAr
              ? "أكمل ملف الشركة ثم تحقق من مفتاح Resend السري للوصول إلى الباقات وتفعيل حسابك بالكامل."
              : "Complete your Company Profile, verify your Secret Resend API Key, and unlock Packages & Plans."}
          </p>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center bg-muted/40 px-3 py-1.5 rounded-xl border border-border/60">
          <span className="text-xs font-bold text-muted-foreground">
            {isAr ? "نسبة الإنجاز:" : "Progress:"}
          </span>
          <span className={`text-sm font-black ${isStep3Done ? "text-emerald-500" : isStep2Done ? "text-indigo-600 dark:text-indigo-400" : isStep1Done ? "text-blue-600" : "text-muted-foreground"}`}>
            {progressPercent}%
          </span>
        </div>
      </div>

      {/* Checkpoints & Progress Bar */}
      <div className="relative py-2">
        <div className="flex items-center justify-between relative z-10">
          {/* STEP 1: Company Profile */}
          <div className="flex flex-col items-center text-center space-y-2 min-w-[70px] sm:min-w-[120px]">
            <Link href="/client/company">
              <div
                className={`w-10 h-10 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center font-bold text-base transition-all duration-500 cursor-pointer ${
                  isStep1Done
                    ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 scale-105"
                    : currentStep === "company"
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30 ring-4 ring-blue-500/20 scale-105"
                    : "bg-muted text-muted-foreground border border-border"
                }`}
              >
                {isStep1Done ? (
                  <Check className="w-5 h-5 stroke-[2.5]" />
                ) : (
                  <Building2 className="w-5 h-5" />
                )}
              </div>
            </Link>

            <div>
              <p className={`text-[11px] sm:text-xs font-bold ${isStep1Done ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"}`}>
                {isAr ? "1. ملف الشركة" : "1. Company"}
              </p>
              <div className="mt-1">
                {isStep1Done ? (
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[9px] sm:text-[10px] font-semibold py-0.5">
                    {isAr ? "مكتمل ✓" : "Done ✓"}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30 text-[9px] sm:text-[10px] font-semibold py-0.5 animate-pulse">
                    {isAr ? "الحالي" : "Current"}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* CONNECTOR LINE 1 */}
          <div className="flex-1 mx-1.5 sm:mx-3 h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden relative shadow-inner">
            <div
              className={`h-full transition-all duration-700 ease-out rounded-full ${
                isStep1Done
                  ? "w-full bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.9)]"
                  : "w-0 bg-emerald-500"
              }`}
            />
          </div>

          {/* STEP 2: Secret Resend API Key */}
          <div className="flex flex-col items-center text-center space-y-2 min-w-[70px] sm:min-w-[120px]">
            <Link href={isStep1Done ? "/client/settings" : "/client/company"}>
              <div
                className={`w-10 h-10 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center font-bold text-base transition-all duration-500 ${
                  isStep1Done ? "cursor-pointer" : "cursor-not-allowed opacity-60"
                } ${
                  isStep2Done
                    ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 scale-105"
                    : currentStep === "settings"
                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/30 ring-4 ring-indigo-500/20 scale-105"
                    : isStep1Done
                    ? "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-2 border-indigo-500/30"
                    : "bg-muted/70 text-muted-foreground/60 border border-border"
                }`}
              >
                {isStep2Done ? (
                  <Check className="w-5 h-5 stroke-[2.5]" />
                ) : isStep1Done ? (
                  <Key className="w-5 h-5" />
                ) : (
                  <Lock className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
            </Link>

            <div>
              <p className={`text-[11px] sm:text-xs font-bold ${isStep2Done ? "text-emerald-600 dark:text-emerald-400" : isStep1Done ? "text-foreground" : "text-muted-foreground"}`}>
                {isAr ? "2. مفتاح Resend" : "2. Resend Key"}
              </p>
              <div className="mt-1">
                {isStep2Done ? (
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[9px] sm:text-[10px] font-semibold py-0.5">
                    {isAr ? "مكتمل ✓" : "Done ✓"}
                  </Badge>
                ) : isStep1Done ? (
                  <Badge variant="outline" className={`${currentStep === "settings" ? "bg-indigo-500/15 text-indigo-600 border-indigo-500/30 animate-pulse" : "bg-blue-500/10 text-blue-600 border-blue-500/30"} text-[9px] sm:text-[10px] font-semibold py-0.5`}>
                    {currentStep === "settings" ? (isAr ? "الحالي" : "Current") : (isAr ? "متاح" : "Unlocked")}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-muted text-muted-foreground/80 border-border text-[9px] sm:text-[10px] font-medium py-0.5">
                    <Lock className="w-2.5 h-2.5 inline mr-0.5" />
                    {isAr ? "مقفل" : "Locked"}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* CONNECTOR LINE 2 */}
          <div className="flex-1 mx-1.5 sm:mx-3 h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden relative shadow-inner">
            <div
              className={`h-full transition-all duration-700 ease-out rounded-full ${
                isStep2Done
                  ? "w-full bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.9)]"
                  : "w-0 bg-emerald-500"
              }`}
            />
          </div>

          {/* STEP 3: Packages & Plans */}
          <div className="flex flex-col items-center text-center space-y-2 min-w-[70px] sm:min-w-[120px]">
            <Link href={isStep2Done ? "/client/packages" : isStep1Done ? "/client/settings" : "/client/company"}>
              <div
                className={`w-10 h-10 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center font-bold text-base transition-all duration-500 ${
                  isStep2Done ? "cursor-pointer" : "cursor-not-allowed opacity-60"
                } ${
                  isStep3Done
                    ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 scale-105"
                    : currentStep === "packages"
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30 ring-4 ring-blue-500/20 scale-105"
                    : isStep2Done
                    ? "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-2 border-blue-500/30"
                    : "bg-muted/70 text-muted-foreground/60 border border-border"
                }`}
              >
                {isStep3Done ? (
                  <Check className="w-5 h-5 stroke-[2.5]" />
                ) : isStep2Done ? (
                  <Package className="w-5 h-5" />
                ) : (
                  <Lock className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
            </Link>

            <div>
              <p className={`text-[11px] sm:text-xs font-bold ${isStep3Done ? "text-emerald-600 dark:text-emerald-400" : isStep2Done ? "text-foreground" : "text-muted-foreground"}`}>
                {isAr ? "3. الباقات" : "3. Packages"}
              </p>
              <div className="mt-1">
                {isStep3Done ? (
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[9px] sm:text-[10px] font-semibold py-0.5">
                    {isAr ? "مكتمل ✓" : "Done ✓"}
                  </Badge>
                ) : isStep2Done ? (
                  <Badge variant="outline" className={`${currentStep === "packages" ? "bg-blue-600/15 text-blue-600 border-blue-500/30 animate-pulse" : "bg-blue-500/10 text-blue-600 border-blue-500/30"} text-[9px] sm:text-[10px] font-semibold py-0.5`}>
                    {currentStep === "packages" ? (isAr ? "الحالي" : "Current") : (isAr ? "متاح" : "Unlocked")}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-muted text-muted-foreground/80 border-border text-[9px] sm:text-[10px] font-medium py-0.5">
                    <Lock className="w-2.5 h-2.5 inline mr-0.5" />
                    {isAr ? "مقفل" : "Locked"}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* CONNECTOR LINE 3 */}
          <div className="flex-1 mx-1.5 sm:mx-3 h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden relative shadow-inner">
            <div
              className={`h-full transition-all duration-700 ease-out rounded-full ${
                isStep3Done
                  ? "w-full bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.9)]"
                  : "w-0 bg-emerald-500"
              }`}
            />
          </div>

          {/* STEP 4: Activation & Launch */}
          <div className="flex flex-col items-center text-center space-y-2 min-w-[70px] sm:min-w-[120px]">
            <div
              className={`w-10 h-10 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center font-bold text-base transition-all duration-500 ${
                isStep3Done
                  ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 scale-105"
                  : "bg-muted/70 text-muted-foreground/60 border border-border"
              }`}
            >
              {isStep3Done ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : (
                <Clock className="w-4 h-4 text-muted-foreground" />
              )}
            </div>

            <div>
              <p className={`text-[11px] sm:text-xs font-bold ${isStep3Done ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                {isAr ? "4. التفعيل" : "4. Activation"}
              </p>
              <div className="mt-1">
                {isStep3Done ? (
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[9px] sm:text-[10px] font-semibold py-0.5">
                    {isAr ? "مفعّل ✓" : "Active ✓"}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-muted text-muted-foreground/80 border-border text-[9px] sm:text-[10px] font-medium py-0.5">
                    {isAr ? "بانتظار الطلب" : "Pending"}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Dynamic guidance message & CTA */}
      {currentStep === "company" && (
        <>
          {isStep1Done ? (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-emerald-500/20">
                  <Check className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
                    {isAr ? "تم إكمال ملف الشركة بنجاح!" : "Company Profile Completed!"}
                  </p>
                  <p className="text-xs text-emerald-600/80 dark:text-emerald-400/80 mt-0.5">
                    {isAr
                      ? "الخطوة التالية: يرجى الانتقال إلى الإعدادات لإدخال مفتاح Resend السري والتحقق منه."
                      : "Next step: Go to Settings to enter and verify your Secret Resend API Key."}
                  </p>
                </div>
              </div>
              <Link href="/client/settings">
                <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold gap-2 rounded-xl text-xs shrink-0 shadow-md">
                  <Key className="w-4 h-4" />
                  <span>{isAr ? "الانتقال إلى الإعدادات - مفتاح Resend (الخطوة 2)" : "Go to Settings - Resend Key (Step 2)"}</span>
                  {isAr ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
                </Button>
              </Link>
            </div>
          ) : (
            <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4 flex items-start gap-3 text-xs leading-relaxed text-muted-foreground">
              <Building2 className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
              <div>
                <span className="font-bold text-foreground">
                  {isAr ? "الخطوة الأولى مطلوبة: " : "Step 1 Required: "}
                </span>
                <span>
                  {isAr
                    ? "يرجى كتابة اسم الشركة ووصف نشاطها في الحقول أدناه ثم الضغط على 'حفظ التغييرات'. بمجرد الحفظ، سيتم توجيهك تلقائياً إلى صفحة الإعدادات لإدخال مفتاح Resend السري."
                    : "Please fill in your company name and general info below, then click 'Save Changes'. You will be automatically redirected to Settings to enter your Secret Resend API Key."}
                </span>
              </div>
            </div>
          )}
        </>
      )}

      {currentStep === "settings" && (
        <>
          {!isStep1Done ? (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-red-500/20 text-red-500 flex items-center justify-center shrink-0">
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-bold text-red-700 dark:text-red-400">
                    {isAr ? "يجب إكمال ملف الشركة أولاً" : "Company Profile Required First"}
                  </p>
                  <p className="text-xs text-red-600/80 dark:text-red-400/80 mt-0.5">
                    {isAr
                      ? "يرجى ملء بيانات اسم الشركة ونشاطها أولاً قبل إدخال مفتاح الإشعارات."
                      : "Please fill in your company name and info before configuring notification keys."}
                  </p>
                </div>
              </div>
              <Link href="/client/company">
                <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white font-bold gap-2 rounded-xl text-xs shrink-0 shadow-md">
                  <span>{isAr ? "الرجوع لإكمال ملف الشركة (الخطوة 1)" : "Complete Company Profile (Step 1)"}</span>
                  {isAr ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
                </Button>
              </Link>
            </div>
          ) : isStep2Done ? (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-emerald-500/20">
                  <Check className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
                    {isAr ? "تم التحقق من مفتاح Resend بنجاح!" : "Secret Resend API Key Verified!"}
                  </p>
                  <p className="text-xs text-emerald-600/80 dark:text-emerald-400/80 mt-0.5">
                    {isAr
                      ? "أصبحت صفحة الباقات والاشتراكات متاحة الآن. يمكنك اختيار الباقة وتفعيل حسابك."
                      : "Packages & Plans is now unlocked! You can now choose a plan and activate your account."}
                  </p>
                </div>
              </div>
              <Link href="/client/packages">
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-2 rounded-xl text-xs shrink-0 shadow-md">
                  <Package className="w-4 h-4" />
                  <span>{isAr ? "الانتقال إلى الباقات والاشتراكات (الخطوة 3)" : "Go to Packages & Plans (Step 3)"}</span>
                  {isAr ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
                </Button>
              </Link>
            </div>
          ) : (
            <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4 flex items-start gap-3 text-xs leading-relaxed text-muted-foreground">
              <Key className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
              <div>
                <span className="font-bold text-foreground">
                  {isAr ? "الخطوة الثانية: " : "Step 2: "}
                </span>
                <span>
                  {isAr
                    ? "أدخل مفتاح Resend السري (يبدأ بـ re_) وبريد الإشعارات، ثم اضغط على زر 'التحقق من المفتاح وحفظه' أدناه. بمجرد التحقق بنجاح، سيتم نقلك مباشرة وبشكل تلقائي إلى صفحة الباقات."
                    : "Enter your Secret Resend API Key (starts with re_) and notification email, then click 'Verify & Save Resend Key'. Upon successful verification, you will be automatically redirected to Packages & Plans."}
                </span>
              </div>
            </div>
          )}
        </>
      )}

      {currentStep === "packages" && (
        <>
          {!isStep1Done ? (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-red-500/20 text-red-500 flex items-center justify-center shrink-0">
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-bold text-red-700 dark:text-red-400">
                    {isAr ? "صفحة الباقات مقفلة حالياً" : "Packages & Plans is Currently Locked"}
                  </p>
                  <p className="text-xs text-red-600/80 dark:text-red-400/80 mt-0.5">
                    {isAr
                      ? "يجب إكمال وحفظ بيانات ملف الشركة أولاً قبل اختيار الباقة."
                      : "You must complete and save your company profile before you can choose a plan."}
                  </p>
                </div>
              </div>
              <Link href="/client/company">
                <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white font-bold gap-2 rounded-xl text-xs shrink-0 shadow-md">
                  <span>{isAr ? "الرجوع لإكمال ملف الشركة" : "Return to Company Profile"}</span>
                  {isAr ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
                </Button>
              </Link>
            </div>
          ) : !isStep2Done ? (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <Key className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-bold text-amber-700 dark:text-amber-300">
                    {isAr ? "مطلوب إدخال مفتاح Resend السري (الخطوة 2)" : "Secret Resend API Key Required (Step 2)"}
                  </p>
                  <p className="text-xs text-amber-600/80 dark:text-amber-400/80 mt-0.5">
                    {isAr
                      ? "يجب إدخال مفتاح Resend والتحقق منه في صفحة الإعدادات لتفعيل إشعارات النظام قبل اختيار الباقة."
                      : "You must configure and verify your Secret Resend API Key in Settings before choosing a plan."}
                  </p>
                </div>
              </div>
              <Link href="/client/settings">
                <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white font-bold gap-2 rounded-xl text-xs shrink-0 shadow-md">
                  <Key className="w-4 h-4" />
                  <span>{isAr ? "الانتقال للإعدادات لإدخال مفتاح Resend" : "Go to Settings for Resend Key"}</span>
                  {isAr ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
                </Button>
              </Link>
            </div>
          ) : (
            <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4 flex items-start gap-3 text-xs leading-relaxed text-muted-foreground">
              <Package className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
              <div>
                <span className="font-bold text-foreground">
                  {isAr ? "الخطوة الثالثة: " : "Step 3: "}
                </span>
                <span>
                  {isAr
                    ? "اختر الباقة الأنسب لاحتياجاتك أدناه واضغط على 'الاشتراك الآن' لإرسال طلب التفعيل إلى الإدارة."
                    : "Select the plan that fits your business below and submit a request to activate your account."}
                </span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
