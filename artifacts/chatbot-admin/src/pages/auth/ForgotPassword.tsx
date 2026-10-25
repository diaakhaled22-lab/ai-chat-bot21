import { useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Mail, Globe, Sun, Moon, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { useTheme } from "@/hooks/use-theme";
import "./modern-login.css";

export default function ForgotPassword() {
  const { toast } = useToast();
  const { lang, setLang } = useLanguage();
  const { theme, toggle: toggleTheme } = useTheme();

  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim()) {
      toast({
        title: lang === "ar" ? "بيانات ناقصة" : "Missing field",
        description: lang === "ar" ? "يرجى كتابة اسم المستخدم" : "Please enter your username",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          title: lang === "ar" ? "خطأ" : "Error",
          description: data.error || (lang === "ar" ? "حدث خطأ ما" : "Something went wrong"),
          variant: "destructive",
        });
      } else {
        setSent(true);
        toast({
          title: lang === "ar" ? "تم الإرسال" : "Link Sent",
          description:
            lang === "ar"
              ? "إذا كان الحساب موجوداً، تم إرسال رابط إعادة التعيين."
              : "If this account exists, a reset link has been dispatched.",
        });
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
      {/* Top Floating Controls (Language & Theme) */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-50">
        <button
          type="button"
          onClick={() => setLang(lang === "ar" ? "en" : "ar")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/70 dark:bg-slate-800/80 backdrop-blur-md border border-black/5 dark:border-white/10 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-sm hover:bg-white dark:hover:bg-slate-800 transition-all cursor-pointer"
          title={lang === "ar" ? "Switch to English" : "التحويل إلى العربية"}
        >
          <Globe className="w-3.5 h-3.5 text-indigo-500" />
          <span>{lang === "ar" ? "English" : "العربية"}</span>
        </button>

        <button
          type="button"
          onClick={toggleTheme}
          className="p-2 rounded-full bg-white/70 dark:bg-slate-800/80 backdrop-blur-md border border-black/5 dark:border-white/10 text-slate-700 dark:text-slate-200 shadow-sm hover:bg-white dark:hover:bg-slate-800 transition-all cursor-pointer"
          title={theme === "dark" ? "Light Mode" : "Dark Mode"}
          aria-label="Toggle Theme"
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
        {/* Bot Icon Badge */}
        <div className="modern-auth-badge">
          {sent ? (
            <Mail className="w-10 h-10 text-white" />
          ) : (
            <i className="fa-solid fa-robot"></i>
          )}
        </div>

        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white mb-1">
          Bot Manager
        </h1>

        <h2 className="text-lg font-semibold text-indigo-600 dark:text-indigo-400 mb-2">
          {lang === "ar" ? "استعادة كلمة المرور" : "Forgot Password"}
        </h2>

        {sent ? (
          <div className="flex flex-col items-center gap-4 py-2 w-full">
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-sm">
              {lang === "ar"
                ? "إذا كان اسم المستخدم هذا مسجلاً في النظام، فقد تم إرسال رابط إعادة تعيين كلمة المرور إلى البريد الإلكتروني للمسؤول. الرابط صالح لمدة ساعة واحدة."
                : "If this username exists, a reset link has been sent to the configured admin email. It expires in 1 hour."}
            </p>

            <Link href="/login" className="w-full mt-2">
              <button type="button" className="modern-login-btn w-full gap-2">
                <ArrowLeft className={`w-4 h-4 ${lang === "ar" ? "rotate-180" : ""}`} />
                <span>{lang === "ar" ? "العودة لتسجيل الدخول" : "Back to Login"}</span>
              </button>
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="w-full flex flex-col items-center mt-2">
            <span className="text-sm text-slate-500 dark:text-slate-400 mb-4 block">
              {lang === "ar"
                ? "أدخل اسم المستخدم لتلقي رابط إعادة تعيين كلمة المرور."
                : "Enter your username to receive a password reset link."}
            </span>

            <div className="modern-input-group w-full mb-3" dir="ltr">
              <span className="icon-slot">
                <i className="fa-solid fa-user"></i>
              </span>
              <input
                type="text"
                placeholder={lang === "ar" ? "اسم المستخدم" : "Username"}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
                required
              />
            </div>

            <button
              type="submit"
              className="modern-login-btn w-full"
              disabled={loading || !username.trim()}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{lang === "ar" ? "جاري الإرسال..." : "Sending..."}</span>
                </>
              ) : (
                lang === "ar" ? "إرسال رابط الاستعادة" : "Send Reset Link"
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
        )}
      </div>
    </div>
  );
}
