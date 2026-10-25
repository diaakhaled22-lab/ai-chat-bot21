import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import {
  CheckCircle,
  XCircle,
  Eye,
  EyeOff,
  ArrowLeft,
  Globe,
  Sun,
  Moon,
  Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { useTheme } from "@/hooks/use-theme";
import "./modern-login.css";

export default function ResetPassword() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { lang, setLang } = useLanguage();
  const { theme, toggle: toggleTheme } = useTheme();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("token");
    setToken(t);
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      toast({
        title: lang === "ar" ? "كلمة المرور قصيرة" : "Password too short",
        description:
          lang === "ar"
            ? "يجب ألا تقل كلمة المرور عن 6 أحرف."
            : "Password must be at least 6 characters.",
        variant: "destructive",
      });
      return;
    }
    if (password !== confirm) {
      toast({
        title: lang === "ar" ? "عدم تطابق" : "Mismatch",
        description:
          lang === "ar" ? "كلمتا المرور غير متطابقتين." : "Passwords do not match.",
        variant: "destructive",
      });
      return;
    }
    if (!token) {
      toast({
        title: lang === "ar" ? "رابط غير صالح" : "Invalid link",
        description:
          lang === "ar" ? "رابط إعادة التعيين غير صالح." : "Invalid reset link.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          title: lang === "ar" ? "خطأ" : "Error",
          description: data.error || (lang === "ar" ? "حدث خطأ ما" : "Something went wrong"),
          variant: "destructive",
        });
      } else {
        setDone(true);
        toast({
          title: lang === "ar" ? "تم بنجاح" : "Success",
          description:
            lang === "ar"
              ? "تم تعيين كلمة المرور الجديدة بنجاح! جاري التوجيه..."
              : "Password updated! Redirecting to login...",
        });
        setTimeout(() => setLocation("/login"), 2500);
      }
    } catch {
      toast({
        title: lang === "ar" ? "خطأ في الشبكة" : "Network error",
        description: lang === "ar" ? "يرجى المحاولة مرة أخرى." : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modern-login-wrapper">
      {/* Top Floating Controls */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-50">
        <button
          type="button"
          onClick={() => setLang(lang === "ar" ? "en" : "ar")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/70 dark:bg-slate-800/80 backdrop-blur-md border border-black/5 dark:border-white/10 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-sm hover:bg-white dark:hover:bg-slate-800 transition-all cursor-pointer"
        >
          <Globe className="w-3.5 h-3.5 text-indigo-500" />
          <span>{lang === "ar" ? "English" : "العربية"}</span>
        </button>

        <button
          type="button"
          onClick={toggleTheme}
          className="p-2 rounded-full bg-white/70 dark:bg-slate-800/80 backdrop-blur-md border border-black/5 dark:border-white/10 text-slate-700 dark:text-slate-200 shadow-sm hover:bg-white dark:hover:bg-slate-800 transition-all cursor-pointer"
        >
          {theme === "dark" ? (
            <Sun className="w-3.5 h-3.5 text-amber-400" />
          ) : (
            <Moon className="w-3.5 h-3.5 text-indigo-500" />
          )}
        </button>
      </div>

      {/* Main Modern Auth Card */}
      <div className="modern-auth-card text-center" dir={lang === "ar" ? "rtl" : "ltr"}>
        {!token ? (
          <div className="flex flex-col items-center gap-4 py-4 w-full">
            <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center border border-red-500/20 mb-2">
              <XCircle className="w-10 h-10 text-red-500" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              {lang === "ar" ? "رابط غير صالح" : "Invalid Token"}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs">
              {lang === "ar"
                ? "رمز إعادة التعيين مفقود أو غير صالح أو منتهي الصلاحية."
                : "The password reset token is missing, invalid, or has expired."}
            </p>
            <Link href="/login" className="w-full mt-2">
              <button type="button" className="modern-login-btn w-full gap-2">
                <ArrowLeft className={`w-4 h-4 ${lang === "ar" ? "rotate-180" : ""}`} />
                <span>{lang === "ar" ? "العودة لتسجيل الدخول" : "Back to Login"}</span>
              </button>
            </Link>
          </div>
        ) : done ? (
          <div className="flex flex-col items-center gap-4 py-4 w-full">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 mb-2">
              <CheckCircle className="w-10 h-10 text-emerald-500" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              {lang === "ar" ? "تم تغيير كلمة المرور" : "Password Updated"}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 max-w-xs">
              {lang === "ar"
                ? "تم تحديث كلمة المرور بنجاح. سيتم تحويلك إلى صفحة تسجيل الدخول خلال لحظات."
                : "Your password has been successfully updated. Redirecting you to login..."}
            </p>
            <Link href="/login" className="w-full mt-2">
              <button type="button" className="modern-login-btn w-full gap-2">
                <ArrowLeft className={`w-4 h-4 ${lang === "ar" ? "rotate-180" : ""}`} />
                <span>{lang === "ar" ? "تسجيل الدخول الآن" : "Go to Login"}</span>
              </button>
            </Link>
          </div>
        ) : (
          <>
            <div className="modern-auth-badge">
              <i className="fa-solid fa-robot"></i>
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white mb-1">
              Bot Manager
            </h1>

            <h2 className="text-lg font-semibold text-indigo-600 dark:text-indigo-400 mb-2">
              {lang === "ar" ? "تعيين كلمة مرور جديدة" : "Set New Password"}
            </h2>

            <span className="text-sm text-slate-500 dark:text-slate-400 mb-4 block">
              {lang === "ar"
                ? "اختر كلمة مرور جديدة وقوية لحسابك."
                : "Choose a strong new password for your account."}
            </span>

            <form onSubmit={onSubmit} className="w-full flex flex-col items-center">
              <div className="modern-input-group w-full mb-2.5" dir="ltr">
                <span className="icon-slot">
                  <i className="fa-solid fa-lock"></i>
                </span>
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder={lang === "ar" ? "كلمة المرور الجديدة" : "New Password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={6}
                  required
                />
                <button
                  type="button"
                  className="modern-toggle-password"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <div className="modern-input-group w-full mb-3" dir="ltr">
                <span className="icon-slot">
                  <i className="fa-solid fa-lock"></i>
                </span>
                <input
                  type={showConfirm ? "text" : "password"}
                  placeholder={lang === "ar" ? "تأكيد كلمة المرور" : "Confirm Password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  minLength={6}
                  required
                />
                <button
                  type="button"
                  className="modern-toggle-password"
                  onClick={() => setShowConfirm(!showConfirm)}
                >
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <button
                type="submit"
                className="modern-login-btn w-full"
                disabled={loading || password.length < 6 || password !== confirm}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{lang === "ar" ? "جاري التحديث..." : "Updating..."}</span>
                  </>
                ) : (
                  lang === "ar" ? "تحديث كلمة المرور" : "Update Password"
                )}
              </button>

              <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800 w-full text-center">
                <Link
                  href="/login"
                  className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1.5 font-medium"
                >
                  <ArrowLeft className={`w-3.5 h-3.5 ${lang === "ar" ? "rotate-180" : ""}`} />
                  <span>{lang === "ar" ? "العودة لتسجيل الدخول" : "Back to Login"}</span>
                </Link>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
