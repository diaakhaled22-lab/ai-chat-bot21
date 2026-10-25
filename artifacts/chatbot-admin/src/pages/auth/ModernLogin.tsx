import { useState, useEffect } from "react";
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
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { useTheme } from "@/hooks/use-theme";
import "./modern-login.css";

interface ModernLoginProps {
  initialMode?: "admin" | "client";
}

export default function ModernLogin({ initialMode = "admin" }: ModernLoginProps) {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const { lang, setLang } = useLanguage();
  const { theme, toggle: toggleTheme } = useTheme();
  const queryClient = useQueryClient();

  // Active state: false = Admin login, true = Client login (sign-up panel in template)
  const [isActive, setIsActive] = useState<boolean>(initialMode === "client");

  // Keep state in sync if navigated directly
  useEffect(() => {
    if (location === "/client-login") {
      setIsActive(true);
    } else if (location === "/login") {
      setIsActive(false);
    }
  }, [location]);

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
    setIsActive(true);
    if (location !== "/client-login") {
      try {
        window.history.replaceState(null, "", "/client-login");
      } catch {}
    }
  };

  const handleSwitchToAdmin = () => {
    setIsActive(false);
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

      {/* Main Container - Explicit dir="ltr" to maintain consistent geometric slider animation */}
      <div
        className={`modern-login-container ${isActive ? "active" : ""}`}
        id="container"
        dir="ltr"
      >
        {/* Mobile Header (Rendered on small screens < 768px) */}
        <div className="mobile-toggle-header">
          <div className="mobile-bot-icon">
            <Bot className="w-10 h-10 text-white" strokeWidth={1.8} />
          </div>
          <h1>Bot Manager</h1>
          <div className="mobile-toggle-switch">
            <button
              type="button"
              className={!isActive ? "active-tab" : ""}
              onClick={handleSwitchToAdmin}
            >
              {lang === "ar" ? "دخول المسؤول" : "Admin Login"}
            </button>
            <button
              type="button"
              className={isActive ? "active-tab" : ""}
              onClick={handleSwitchToClient}
            >
              {lang === "ar" ? "دخول العميل" : "Client Login"}
            </button>
          </div>
        </div>

        {/* Client Login Form Panel (sign-up in template layout) */}
        <div className="modern-form-container modern-sign-up">
          <form className="modern-login-form" onSubmit={handleClientSubmit}>
            <h1>{lang === "ar" ? "تسجيل دخول العميل" : "Client Login"}</h1>
            <span>
              {lang === "ar"
                ? "سجل الدخول لإدارة روبوت الذكاء الاصطناعي."
                : "Sign in to manage your AI deployment."}
            </span>

            <div className="modern-input-group modern-input">
              <span className="icon-slot">
                <i className="fa-solid fa-user"></i>
              </span>
              <input
                type="text"
                placeholder={lang === "ar" ? "اسم المستخدم" : "Username"}
                value={clientUsername}
                onChange={(e) => setClientUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </div>

            <div className="modern-input-group modern-input">
              <span className="icon-slot">
                <i className="fa-solid fa-lock"></i>
              </span>
              <input
                type={showClientPassword ? "text" : "password"}
                placeholder={lang === "ar" ? "كلمة المرور" : "Password"}
                id="clientPasswordInput"
                value={clientPassword}
                onChange={(e) => setClientPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="modern-toggle-password client-toggle"
                aria-label={showClientPassword ? "Hide password" : "Show password"}
                onClick={() => setShowClientPassword(!showClientPassword)}
              >
                {showClientPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>

            <button
              type="submit"
              className="modern-login-btn"
              disabled={clientLogin.isPending}
            >
              {clientLogin.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{lang === "ar" ? "جاري الدخول..." : "Signing In..."}</span>
                </>
              ) : (
                lang === "ar" ? "تسجيل الدخول" : "Sign In"
              )}
            </button>
          </form>
        </div>

        {/* Admin Login Form Panel (sign-in in template layout) */}
        <div className="modern-form-container modern-sign-in">
          {!tempToken ? (
            <form className="modern-login-form" onSubmit={handleAdminSubmit}>
              <h1>{lang === "ar" ? "تسجيل دخول المسؤول" : "Admin Login"}</h1>
              <span>
                {lang === "ar"
                  ? "المصادقة للوصول إلى لوحة الإدارة."
                  : "Authenticate to access the admin portal."}
              </span>

              <div className="modern-input-group">
                <span className="icon-slot">
                  <i className="fa-solid fa-user"></i>
                </span>
                <input
                  type="text"
                  placeholder={lang === "ar" ? "اسم المستخدم" : "Username"}
                  value={adminUsername}
                  onChange={(e) => setAdminUsername(e.target.value)}
                  autoComplete="username"
                  required
                />
              </div>

              <div className="modern-input-group">
                <span className="icon-slot">
                  <i className="fa-solid fa-lock"></i>
                </span>
                <input
                  type={showAdminPassword ? "text" : "password"}
                  placeholder={lang === "ar" ? "كلمة المرور" : "Password"}
                  id="passwordInput"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="modern-toggle-password"
                  aria-label={showAdminPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowAdminPassword(!showAdminPassword)}
                >
                  {showAdminPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>

              <Link href="/forgot-password">
                {lang === "ar" ? "هل نسيت كلمة المرور؟" : "Forget Your Password?"}
              </Link>

              <button
                type="submit"
                className="modern-login-btn"
                disabled={adminLogin.isPending}
              >
                {adminLogin.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{lang === "ar" ? "جاري التحقق..." : "Signing In..."}</span>
                  </>
                ) : (
                  lang === "ar" ? "تسجيل الدخول" : "Sign In"
                )}
              </button>
            </form>
          ) : (
            /* 2FA Verification View */
            <form className="modern-login-form" onSubmit={handle2faSubmit}>
              <div className="w-12 h-12 rounded-xl bg-purple-500/15 flex items-center justify-center mb-2">
                <KeyRound className="w-6 h-6 text-purple-600 dark:text-purple-400" />
              </div>
              <h1 className="text-xl font-bold">
                {lang === "ar" ? "المصادقة الثنائية" : "Two-Factor Auth"}
              </h1>
              <span>
                {lang === "ar"
                  ? "أدخل رمز التحقق المكون من 6 أرقام."
                  : "Enter the 6-digit code from your authenticator app."}
              </span>

              <div className="modern-input-group mt-3">
                <span className="icon-slot">
                  <KeyRound className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  placeholder="123456"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                  className="text-center font-bold tracking-widest text-lg"
                  autoFocus
                  required
                />
              </div>

              <div className="flex gap-2 w-full mt-2">
                <button
                  type="button"
                  onClick={() => setTempToken(null)}
                  className="modern-login-btn btn-hidden !text-slate-700 dark:!text-slate-200 !border-slate-300 dark:!border-slate-700 !px-4 flex-1"
                  disabled={verify2fa.isPending}
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>{lang === "ar" ? "رجوع" : "Back"}</span>
                </button>
                <button
                  type="submit"
                  className="modern-login-btn flex-1"
                  disabled={verify2fa.isPending || otpCode.length !== 6}
                >
                  {verify2fa.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    lang === "ar" ? "تحقق" : "Verify"
                  )}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Sliding Toggle Overlay Panel */}
        <div className="modern-toggle-container">
          <div className="modern-toggle">
            {/* Left Panel: Revealed when Active (Client is visible), offers switch to Admin */}
            <div className="modern-toggle-panel modern-toggle-left">
              <div className="modern-bot-icon modern-left-bot-icon">
                <i className="fa-solid fa-robot"></i>
              </div>
              <h1>Bot Manager</h1>
              <button
                type="button"
                className="modern-login-btn btn-hidden"
                id="login"
                onClick={handleSwitchToAdmin}
              >
                {lang === "ar" ? "تسجيل دخول المسؤول" : "Admin Login"}
              </button>
            </div>

            {/* Right Panel: Revealed when Inactive (Admin is visible), offers switch to Client */}
            <div className="modern-toggle-panel modern-toggle-right">
              <div className="modern-bot-icon">
                <i className="fa-solid fa-robot"></i>
              </div>
              <h1>Bot Manager</h1>
              <button
                type="button"
                className="modern-login-btn btn-hidden"
                id="register"
                onClick={handleSwitchToClient}
              >
                {lang === "ar" ? "تسجيل دخول العميل" : "Client Login"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
