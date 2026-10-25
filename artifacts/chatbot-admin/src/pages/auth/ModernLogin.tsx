import React, { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import {
  useAdminLogin,
  useAdminLoginVerify2fa,
  useClientLogin,
  getGetMeQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  Lock,
  User,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Globe,
  Sun,
  Moon,
  ArrowLeft,
  ShieldCheck,
  Building2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { useTheme } from "@/hooks/use-theme";
import "./modern-login.css";

interface ModernLoginProps {
  initialMode?: "admin" | "client";
}

/**
 * Modern Sliding Panel Overlay (Double Sign-In) Page
 * Integrated with real backend authentication, 2FA, language & theme controls.
 */
export default function ModernLogin({ initialMode = "admin" }: ModernLoginProps) {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const { lang, setLang } = useLanguage();
  const { theme, toggle: toggleTheme } = useTheme();
  const queryClient = useQueryClient();

  // 1. State Management:
  // false = Default State (Overlay sits on the Right, covers Client form, Admin form visible on Left)
  // true  = Active State (Overlay slides to the Left, covers Admin form, Client form visible on Right)
  const [isRightPanelActive, setIsRightPanelActive] = useState<boolean>(initialMode === "client");

  // Keep state in sync if navigated directly
  useEffect(() => {
    if (location === "/client-login" && !isRightPanelActive) {
      setIsRightPanelActive(true);
    } else if (location === "/login" && isRightPanelActive) {
      setIsRightPanelActive(false);
    }
  }, [location, isRightPanelActive]);

  // Admin form state
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [tempToken, setTempToken] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");

  // Client form state
  const [clientUsername, setClientUsername] = useState("");
  const [clientPassword, setClientPassword] = useState("");
  const [showClientPassword, setShowClientPassword] = useState(false);

  // Mutations
  const adminLogin = useAdminLogin();
  const verify2fa = useAdminLoginVerify2fa();
  const clientLogin = useClientLogin();

  const handleSwitchToClient = () => {
    setIsRightPanelActive(true);
    if (location !== "/client-login") {
      try {
        window.history.replaceState(null, "", "/client-login");
      } catch {}
    }
  };

  const handleSwitchToAdmin = () => {
    setIsRightPanelActive(false);
    if (location !== "/login") {
      try {
        window.history.replaceState(null, "", "/login");
      } catch {}
    }
  };

  // Submit Admin Login
  const handleAdminSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminUsername.trim() || !adminPassword.trim()) {
      toast({
        title: lang === "ar" ? "بيانات ناقصة" : "Missing fields",
        description: lang === "ar" ? "يرجى إدخال اسم المستخدم وكلمة المرور" : "Please enter username and password",
        variant: "destructive",
      });
      return;
    }

    adminLogin.mutate(
      { data: { username: adminUsername.trim(), password: adminPassword } },
      {
        onSuccess: (data) => {
          if (data.requires2FA) {
            setTempToken(data.tempToken!);
            toast({
              title: lang === "ar" ? "المصادقة الثنائية مطلوبة" : "2FA Required",
              description:
                lang === "ar"
                  ? "يرجى إدخال رمز التحقق المكون من 6 أرقام"
                  : "Please enter your authenticator code.",
            });
            return;
          }

          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          toast({
            title: lang === "ar" ? "مرحباً بك مجدداً" : "Welcome back",
            description:
              lang === "ar"
                ? "تم تسجيل الدخول بنجاح كمسؤول النظام."
                : "Successfully logged in as administrator.",
          });
          setLocation("/admin/dashboard");
        },
        onError: (error: any) => {
          toast({
            title: lang === "ar" ? "فشل تسجيل الدخول" : "Login failed",
            description: error?.message || (lang === "ar" ? "بيانات الدخول غير صحيحة" : "Invalid login credentials"),
            variant: "destructive",
          });
        },
      }
    );
  };

  // Submit 2FA verification
  const handle2faSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = otpCode.replace(/\D/g, "");
    if (cleanCode.length !== 6) {
      toast({
        title: lang === "ar" ? "رمز غير صالح" : "Invalid Code",
        description: lang === "ar" ? "يجب أن يتكون الرمز من 6 أرقام" : "Code must be exactly 6 digits",
        variant: "destructive",
      });
      return;
    }

    verify2fa.mutate(
      { data: { tempToken: tempToken!, code: cleanCode } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          toast({
            title: lang === "ar" ? "مرحباً بك مجدداً" : "Welcome back",
            description:
              lang === "ar"
                ? "تم التحقق وتسجيل الدخول كمسؤول بنجاح."
                : "Successfully logged in as administrator.",
          });
          setLocation("/admin/dashboard");
        },
        onError: (error: any) => {
          toast({
            title: lang === "ar" ? "فشل التحقق" : "Verification failed",
            description: error?.message || (lang === "ar" ? "رمز التحقق غير صحيح" : "Invalid verification code"),
            variant: "destructive",
          });
        },
      }
    );
  };

  // Submit Client Login
  const handleClientSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientUsername.trim() || !clientPassword.trim()) {
      toast({
        title: lang === "ar" ? "بيانات ناقصة" : "Missing fields",
        description: lang === "ar" ? "يرجى إدخال اسم المستخدم وكلمة المرور" : "Please enter username and password",
        variant: "destructive",
      });
      return;
    }

    clientLogin.mutate(
      { data: { username: clientUsername.trim(), password: clientPassword } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          toast({
            title: lang === "ar" ? "مرحباً بك" : "Welcome back",
            description:
              lang === "ar"
                ? "تم تسجيل الدخول بنجاح إلى بوابة العميل."
                : "Successfully logged in to client portal.",
          });
          setLocation("/client/dashboard");
        },
        onError: (error: any) => {
          toast({
            title: lang === "ar" ? "فشل تسجيل الدخول" : "Login failed",
            description: error?.message || (lang === "ar" ? "بيانات الدخول غير صحيحة" : "Invalid login credentials"),
            variant: "destructive",
          });
        },
      }
    );
  };

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
          <Globe className="w-3.5 h-3.5 text-blue-500" />
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
            <Moon className="w-3.5 h-3.5 text-blue-500" />
          )}
        </button>
      </div>

      {/* 2. Main Container */}
      <div
        className={`relative w-full max-w-4xl min-h-[560px] bg-white dark:bg-slate-900 rounded-3xl shadow-2xl shadow-slate-400/25 dark:shadow-black/50 overflow-hidden flex flex-col md:flex-row border border-slate-200/60 dark:border-slate-800 transition-all ${
          isRightPanelActive ? "active" : ""
        }`}
        id="container"
        dir="ltr"
      >
        {/* Mobile Header (Rendered on small screens < 768px) */}
        <div
          className="md:hidden w-full flex flex-col items-center p-6 text-center text-white"
          style={{ background: "linear-gradient(135deg, #1e40af 0%, #2563eb 50%, #1d4ed8 100%)" }}
        >
          <div className="w-16 h-16 rounded-2xl bg-white/15 backdrop-blur-md border border-white/25 flex items-center justify-center mb-3 shadow-inner">
            <i className="fa-solid fa-robot text-2xl text-white"></i>
          </div>
          <h1 className="text-xl font-bold">Bot Manager</h1>
          <div className="flex bg-black/20 p-1 rounded-full mt-3 gap-1">
            <button
              type="button"
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                !isRightPanelActive
                  ? "bg-white text-blue-700 shadow-sm"
                  : "text-white/80 hover:text-white"
              }`}
              onClick={handleSwitchToAdmin}
            >
              {lang === "ar" ? "دخول المسؤول" : "Admin Login"}
            </button>
            <button
              type="button"
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                isRightPanelActive
                  ? "bg-white text-blue-700 shadow-sm"
                  : "text-white/80 hover:text-white"
              }`}
              onClick={handleSwitchToClient}
            >
              {lang === "ar" ? "دخول العميل" : "Client Login"}
            </button>
          </div>
        </div>

        {/* 3. The Forms (Background Layer) */}

        {/* LEFT SIDE: Admin Login Form */}
        <div
          className={`w-full md:w-1/2 md:absolute md:top-0 md:left-0 h-full flex flex-col justify-center items-center px-8 sm:px-14 py-10 transition-all duration-[600ms] ease-in-out ${
            !isRightPanelActive
              ? "z-10 opacity-100 pointer-events-auto"
              : "md:z-0 md:opacity-0 md:pointer-events-none hidden md:flex"
          }`}
        >
          {!tempToken ? (
            <div className="w-full max-w-sm flex flex-col items-center text-center">
              {/* Admin Shield Icon */}
              <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-3 shadow-sm border border-blue-100 dark:border-blue-800">
                <ShieldCheck className="w-6 h-6" />
              </div>

              <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                {lang === "ar" ? "تسجيل دخول المسؤول" : "Admin Login"}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-6">
                {lang === "ar"
                  ? "المصادقة للوصول إلى لوحة الإدارة الرئيسية"
                  : "Authenticate to access the admin portal"}
              </p>

              <form onSubmit={handleAdminSubmit} className="w-full flex flex-col gap-3.5">
                {/* Username Input */}
                <div className="relative w-full text-left">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400">
                    <User className="w-5 h-5" />
                  </span>
                  <input
                    type="text"
                    required
                    placeholder={lang === "ar" ? "اسم المستخدم" : "Admin Username"}
                    value={adminUsername}
                    onChange={(e) => setAdminUsername(e.target.value)}
                    autoComplete="username"
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 transition-all"
                  />
                </div>

                {/* Password Input */}
                <div className="relative w-full text-left">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400">
                    <Lock className="w-5 h-5" />
                  </span>
                  <input
                    type={showAdminPassword ? "text" : "password"}
                    required
                    placeholder={lang === "ar" ? "كلمة المرور" : "Password"}
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    autoComplete="current-password"
                    className="w-full pl-10 pr-11 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAdminPassword(!showAdminPassword)}
                    aria-label="Toggle password visibility"
                    className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                  >
                    {showAdminPassword ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                </div>

                {/* Forgot Password Link */}
                <div className="flex justify-end pt-0.5">
                  <Link
                    href="/forgot-password"
                    className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 hover:underline transition-colors"
                  >
                    {lang === "ar" ? "هل نسيت كلمة المرور؟" : "Forgot Your Password?"}
                  </Link>
                </div>

                {/* Solid SIGN IN Button */}
                <button
                  type="submit"
                  disabled={adminLogin.isPending}
                  className="w-full mt-2 py-3.5 px-6 bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white text-xs font-bold tracking-wider uppercase rounded-xl shadow-lg shadow-blue-600/30 transition-all focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 flex items-center justify-center gap-2"
                >
                  {adminLogin.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{lang === "ar" ? "جاري التحقق..." : "Signing In..."}</span>
                    </>
                  ) : (
                    lang === "ar" ? "تسجيل الدخول" : "SIGN IN"
                  )}
                </button>
              </form>
            </div>
          ) : (
            /* 2FA Verification View */
            <div className="w-full max-w-sm flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-3">
                <KeyRound className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                {lang === "ar" ? "المصادقة الثنائية" : "Two-Factor Auth"}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-5">
                {lang === "ar"
                  ? "أدخل رمز التحقق المكون من 6 أرقام"
                  : "Enter the 6-digit code from your authenticator app"}
              </p>

              <form onSubmit={handle2faSubmit} className="w-full flex flex-col gap-3.5">
                <div className="relative w-full">
                  <input
                    type="text"
                    placeholder="123456"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                    className="w-full py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-center font-bold tracking-widest text-lg text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 transition-all"
                    autoFocus
                    required
                  />
                </div>

                <div className="flex gap-2 w-full mt-2">
                  <button
                    type="button"
                    onClick={() => setTempToken(null)}
                    disabled={verify2fa.isPending}
                    className="flex-1 py-3 px-4 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-all flex items-center justify-center gap-1.5"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>{lang === "ar" ? "رجوع" : "Back"}</span>
                  </button>

                  <button
                    type="submit"
                    disabled={verify2fa.isPending || otpCode.length !== 6}
                    className="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold uppercase rounded-xl shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center gap-1.5"
                  >
                    {verify2fa.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      lang === "ar" ? "تحقق" : "Verify"
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* RIGHT SIDE: Client Login Form */}
        <div
          className={`w-full md:w-1/2 md:absolute md:top-0 md:right-0 h-full flex flex-col justify-center items-center px-8 sm:px-14 py-10 transition-all duration-[600ms] ease-in-out ${
            isRightPanelActive
              ? "z-10 opacity-100 pointer-events-auto"
              : "md:z-0 md:opacity-0 md:pointer-events-none hidden md:flex"
          }`}
        >
          <div className="w-full max-w-sm flex flex-col items-center text-center">
            {/* Client Building Icon */}
            <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-3 shadow-sm border border-indigo-100 dark:border-indigo-800">
              <Building2 className="w-6 h-6" />
            </div>

            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              {lang === "ar" ? "تسجيل دخول العميل" : "Client Login"}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-6">
              {lang === "ar"
                ? "سجل الدخول لإدارة روبوت الذكاء الاصطناعي الخاص بك"
                : "Manage your chatbot deployment portal"}
            </p>

            <form onSubmit={handleClientSubmit} className="w-full flex flex-col gap-3.5">
              {/* Username Input */}
              <div className="relative w-full text-left">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400">
                  <User className="w-5 h-5" />
                </span>
                <input
                  type="text"
                  required
                  placeholder={lang === "ar" ? "اسم المستخدم" : "Client Username"}
                  value={clientUsername}
                  onChange={(e) => setClientUsername(e.target.value)}
                  autoComplete="username"
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 transition-all"
                />
              </div>

              {/* Password Input */}
              <div className="relative w-full text-left">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400">
                  <Lock className="w-5 h-5" />
                </span>
                <input
                  type={showClientPassword ? "text" : "password"}
                  required
                  placeholder={lang === "ar" ? "كلمة المرور" : "Password"}
                  value={clientPassword}
                  onChange={(e) => setClientPassword(e.target.value)}
                  autoComplete="current-password"
                  className="w-full pl-10 pr-11 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowClientPassword(!showClientPassword)}
                  aria-label="Toggle password visibility"
                  className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                >
                  {showClientPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>

              {/* Forgot Password Link */}
              <div className="flex justify-end pt-0.5">
                <Link
                  href="/forgot-password"
                  className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 hover:underline transition-colors"
                >
                  {lang === "ar" ? "هل نسيت كلمة المرور؟" : "Forgot Your Password?"}
                </Link>
              </div>

              {/* Solid SIGN IN Button */}
              <button
                type="submit"
                disabled={clientLogin.isPending}
                className="w-full mt-2 py-3.5 px-6 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] text-white text-xs font-bold tracking-wider uppercase rounded-xl shadow-lg shadow-indigo-600/30 transition-all focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 flex items-center justify-center gap-2"
              >
                {clientLogin.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{lang === "ar" ? "جاري الدخول..." : "Signing In..."}</span>
                  </>
                ) : (
                  lang === "ar" ? "تسجيل الدخول" : "SIGN IN"
                )}
              </button>
            </form>
          </div>
        </div>

        {/* 4. The Sliding Overlay (Foreground Layer - Desktop only) */}
        <div
          className={`hidden md:block absolute top-0 left-1/2 w-1/2 h-full z-50 overflow-hidden shadow-2xl transition-all duration-[600ms] ease-in-out text-white ${
            isRightPanelActive
              ? "-translate-x-full rounded-tr-[150px] rounded-br-[100px] rounded-tl-none rounded-bl-none"
              : "translate-x-0 rounded-tl-[150px] rounded-bl-[100px] rounded-tr-none rounded-br-none"
          }`}
          style={{
            willChange: "transform, border-radius",
          }}
        >
          {/* Inner 200% width layer (.toggle) driven by translateX(50%) and translateX(0) */}
          <div
            className={`relative left-[-100%] h-full w-[200%] text-white transition-all duration-[600ms] ease-in-out ${
              isRightPanelActive ? "translate-x-1/2" : "translate-x-0"
            }`}
            style={{
              background: "linear-gradient(135deg, #1e40af 0%, #2563eb 50%, #1d4ed8 100%)",
              willChange: "transform",
            }}
          >
            {/* Left Sub-panel (.toggle-left): Visible in Active State (When overlay is on the Left, covering Admin) */}
            <div
              className={`absolute top-0 left-0 w-1/2 h-full flex flex-col justify-center items-center px-10 text-center transition-all duration-[600ms] ease-in-out ${
                isRightPanelActive ? "translate-x-0" : "-translate-x-[200%]"
              }`}
            >
              {/* Robot Icon Badge */}
              <div className="modern-bot-icon">
                <i className="fa-solid fa-robot"></i>
              </div>

              <h3 className="text-[2.65rem] font-bold text-white tracking-tight mb-3 leading-tight">
                Bot Manager
              </h3>
              <p className="text-sm text-white/90 mb-6 max-w-[280px] leading-relaxed">
                {lang === "ar"
                  ? "للرجوع إلى لوحة تحكم المسؤول الرئيسية."
                  : "Access the administrator management portal."}
              </p>

              {/* Ghost Button: ADMIN LOGIN */}
              <button
                type="button"
                onClick={handleSwitchToAdmin}
                className="modern-login-btn btn-hidden"
              >
                {lang === "ar" ? "دخول المسؤول" : "ADMIN LOGIN"}
              </button>
            </div>

            {/* Right Sub-panel (.toggle-right): Visible in Default State (When overlay is on the Right, covering Client) */}
            <div
              className={`absolute top-0 right-0 w-1/2 h-full flex flex-col justify-center items-center px-10 text-center transition-all duration-[600ms] ease-in-out ${
                isRightPanelActive ? "translate-x-[200%]" : "translate-x-0"
              }`}
            >
              {/* Robot Icon Badge */}
              <div className="modern-bot-icon">
                <i className="fa-solid fa-robot"></i>
              </div>

              <h3 className="text-[2.65rem] font-bold text-white tracking-tight mb-3 leading-tight">
                Bot Manager
              </h3>
              <p className="text-sm text-white/90 mb-6 max-w-[280px] leading-relaxed">
                {lang === "ar"
                  ? "للوصول إلى لوحة إعدادات بوت العميل."
                  : "Access your client chatbot deployment portal."}
              </p>

              {/* Ghost Button: CLIENT LOGIN */}
              <button
                type="button"
                onClick={handleSwitchToClient}
                className="modern-login-btn btn-hidden"
              >
                {lang === "ar" ? "دخول العميل" : "CLIENT LOGIN"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
