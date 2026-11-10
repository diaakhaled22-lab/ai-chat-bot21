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
  ArrowRight,
  ShieldCheck,
  Building2,
  UserPlus,
  Mail,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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

  // New Client Registration state
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [regStep, setRegStep] = useState<"details" | "otp">("details");
  const [regName, setRegName] = useState("");
  const [regUsername, setRegUsername] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [regOtp, setRegOtp] = useState("");
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);

  // Compute registration password strength
  const regPasswordStrength = useMemo(() => {
    if (!regPassword) return "empty";
    let score = 0;
    if (regPassword.length >= 8) score++;
    if (regPassword.length >= 10) score++;
    if (/[A-Z]/.test(regPassword)) score++;
    if (/[a-z]/.test(regPassword)) score++;
    if (/\d/.test(regPassword)) score++;
    if (/[^A-Za-z0-9]/.test(regPassword)) score++;

    // Strong: at least 8 chars + uppercase + lowercase + number + extra length/symbol (score >= 5)
    // Medium: meets basic criteria or score 3-4
    // Weak: score <= 2 or length < 8
    if (regPassword.length >= 8 && /[A-Z]/.test(regPassword) && /[a-z]/.test(regPassword) && /\d/.test(regPassword) && score >= 5) {
      return "strong";
    }
    if (regPassword.length >= 8 && score >= 3) {
      return "medium";
    }
    return "weak";
  }, [regPassword]);

  useEffect(() => {
    if (otpCooldown <= 0) return;
    const timer = setInterval(() => {
      setOtpCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [otpCooldown]);

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
      { data: { username: adminUsername.trim(), password: adminPassword } as any },
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
      { data: { username: clientUsername.trim(), password: clientPassword } as any },
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

  // Step 1: Request OTP code to verify real email
  const handleRequestOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!regName.trim() || !regUsername.trim() || !regEmail.trim() || !regPassword.trim()) {
      toast({
        title: lang === "ar" ? "بيانات ناقصة" : "Missing fields",
        description: lang === "ar" ? "يرجى تعبئة جميع الحقول المطلوبة بما فيها البريد الإلكتروني" : "Please fill in all required fields including email",
        variant: "destructive",
      });
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(regEmail.trim())) {
      toast({
        title: lang === "ar" ? "بريد غير صالح" : "Invalid Email",
        description: lang === "ar" ? "يرجى إدخال بريد إلكتروني صحيح مثل yourname@gmail.com" : "Please enter a valid email address",
        variant: "destructive",
      });
      return;
    }

    if (regPassword.length < 8) {
      toast({
        title: lang === "ar" ? "كلمة المرور قصيرة" : "Weak Password",
        description: lang === "ar" ? "يجب أن تكون كلمة المرور 8 أحرف على الأقل" : "Password must be at least 8 characters long",
        variant: "destructive",
      });
      return;
    }

    setRegError(null);
    setIsSendingOtp(true);
    try {
      const res = await fetch("/api/auth/send-registration-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: regName.trim(),
          username: regUsername.trim(),
          email: regEmail.trim(),
          lang,
        }),
      });

      let errorMsg = "";
      try {
        const text = await res.text();
        try {
          const parsed = JSON.parse(text);
          errorMsg = parsed.error || parsed.message || "";
        } catch {
          errorMsg = text.slice(0, 150);
        }
      } catch {}

      if (!res.ok) {
        throw new Error(errorMsg || (lang === "ar" ? "فشل إرسال رمز التحقق" : "Failed to send verification code"));
      }

      setRegStep("otp");
      setOtpCooldown(60);
      toast({
        title: lang === "ar" ? "تم إرسال كود التحقق" : "Verification Code Sent",
        description:
          lang === "ar"
            ? `تم إرسال رمز تحقق مكوّن من 6 أرقام إلى بريدك: ${regEmail.trim()}`
            : `A 6-digit verification code was sent to ${regEmail.trim()}`,
      });
    } catch (err: any) {
      setRegError(err.message);
      toast({
        title: lang === "ar" ? "تعذر إرسال الرمز" : "Could Not Send Code",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsSendingOtp(false);
    }
  };

  // Step 2: Submit New Client Registration with OTP code
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regOtp.trim() || regOtp.trim().length !== 6) {
      toast({
        title: lang === "ar" ? "رمز التحقق مطلوب" : "OTP Code Required",
        description: lang === "ar" ? "يرجى إدخال رمز التحقق المكون من 6 أرقام المرسل إلى بريدك" : "Please enter the 6-digit verification code",
        variant: "destructive",
      });
      return;
    }

    setRegError(null);
    setIsRegistering(true);
    try {
      const res = await fetch("/api/auth/client/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: regName.trim(),
          username: regUsername.trim(),
          email: regEmail.trim(),
          password: regPassword,
          otpCode: regOtp.trim(),
          lang,
        }),
        credentials: "include",
      });

      let errorMsg = "";
      try {
        const text = await res.text();
        try {
          const parsed = JSON.parse(text);
          errorMsg = parsed.error || parsed.message || "";
        } catch {
          if (res.status === 404) {
            errorMsg = lang === "ar"
              ? "مسار تسجيل العميل غير مفعل على الخادم. يرجى إعادة تشغيل خادم api-server."
              : "Registration route not found (404). Please rebuild and restart the api-server.";
          } else {
            errorMsg = text.slice(0, 150);
          }
        }
      } catch {}

      if (!res.ok) {
        throw new Error(errorMsg || (lang === "ar" ? "فشل إنشاء الحساب" : "Failed to create account"));
      }

      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      toast({
        title: lang === "ar" ? "تم التحقق وإنشاء الحساب بنجاح" : "Account Created",
        description: lang === "ar" ? "تم التحقق من بريدك الإلكتروني بنجاح! مرحباً بك في لوحة العميل." : "Welcome! Your email has been verified and you are now logged in.",
      });

      setIsRegisterOpen(false);
      setRegStep("details");
      setRegOtp("");
      setRegName("");
      setRegUsername("");
      setRegEmail("");
      setRegPassword("");
      setLocation("/client/dashboard");
    } catch (err: any) {
      setRegError(err.message);
      toast({
        title: lang === "ar" ? "خطأ في التسجيل" : "Registration Error",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsRegistering(false);
    }
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
                <div className="flex justify-center pt-0.5">
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
            <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-3 shadow-sm border border-blue-100 dark:border-blue-800">
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
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 transition-all"
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
                  className="w-full pl-10 pr-11 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 transition-all"
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

              {/* Solid SIGN IN Button */}
              <button
                type="submit"
                disabled={clientLogin.isPending}
                className="w-full mt-2 py-3.5 px-6 bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white text-xs font-bold tracking-wider uppercase rounded-xl shadow-lg shadow-blue-600/30 transition-all focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 flex items-center justify-center gap-2 cursor-pointer"
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

              {/* Divider */}
              <div className="relative flex items-center justify-center my-0.5">
                <div className="border-t border-slate-200 dark:border-slate-700 w-full" />
                <span className="bg-white dark:bg-slate-900 px-3 text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                  {lang === "ar" ? "أو" : "OR"}
                </span>
              </div>

              {/* New Client Button */}
              <button
                type="button"
                onClick={() => setIsRegisterOpen(true)}
                className="w-full py-3 px-4 rounded-xl border-2 border-blue-600/25 dark:border-blue-500/30 hover:border-blue-600 dark:hover:border-blue-400 bg-blue-50/70 hover:bg-blue-100/80 dark:bg-blue-950/40 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-xs font-bold tracking-wider uppercase transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-[0.99]"
              >
                <UserPlus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>{lang === "ar" ? "عميل جديد (New Client)" : "New Client"}</span>
              </button>
            </form>
          </div>
        </div>

        {/* 4. The Sliding Overlay (Foreground Layer - Desktop only) */}
        <div
          className={`hidden md:flex absolute top-0 left-0 w-1/2 h-full z-50 overflow-hidden shadow-2xl transition-all duration-[600ms] ease-in-out text-white ${
            isRightPanelActive
              ? "translate-x-0 rounded-tr-[150px] rounded-br-[100px] rounded-tl-none rounded-bl-none"
              : "translate-x-full rounded-tl-[150px] rounded-bl-[100px] rounded-tr-none rounded-br-none"
          }`}
          style={{
            background: "linear-gradient(135deg, #1e40af 0%, #2563eb 50%, #1d4ed8 100%)",
            transition: "all 0.6s ease-in-out",
            transitionProperty: "transform, border-radius",
            willChange: "transform, border-radius",
          }}
        >
          {/* Sub-panel 1: Visible in Default State (When overlay is on the Right, covering Client) */}
          <div
            className={`absolute inset-0 flex flex-col justify-center items-center px-10 text-center transition-all duration-[600ms] ease-in-out ${
              !isRightPanelActive
                ? "opacity-100 translate-x-0 pointer-events-auto"
                : "opacity-0 -translate-x-12 pointer-events-none"
            }`}
          >
            {/* Robot Icon Badge (Exact style as shown in the picture) */}
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

          {/* Sub-panel 2: Visible in Active State (When overlay is on the Left, covering Admin) */}
          <div
            className={`absolute inset-0 flex flex-col justify-center items-center px-10 text-center transition-all duration-[600ms] ease-in-out ${
              isRightPanelActive
                ? "opacity-100 translate-x-0 pointer-events-auto"
                : "opacity-0 translate-x-12 pointer-events-none"
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
        </div>
      </div>

      {/* New Client Registration Modal with OTP Verification */}
      <Dialog
        open={isRegisterOpen}
        onOpenChange={(open) => {
          setIsRegisterOpen(open);
          if (!open) {
            setRegError(null);
            setRegStep("details");
            setRegOtp("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-6" dir={lang === "ar" ? "rtl" : "ltr"}>
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                {regStep === "otp" ? <Mail className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
              </div>
              <div className="text-start">
                <DialogTitle className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  {regStep === "otp"
                    ? lang === "ar" ? "تأكيد رمز التحقق (Email OTP)" : "Verify Email (OTP)"
                    : lang === "ar" ? "تسجيل عميل جديد (New Client)" : "New Client Registration"}
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {regStep === "otp"
                    ? lang === "ar"
                      ? `تم إرسال رمز التحقق إلى: ${regEmail}`
                      : `A 6-digit verification code was sent to ${regEmail}`
                    : lang === "ar"
                      ? "أدخل بياناتك وسيتم إرسال كود تحقق إلى بريدك الإلكتروني لتفعيل الحساب."
                      : "Enter your details. A verification code will be sent to your email."}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {regError && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 text-xs flex items-start gap-2.5 shadow-sm mt-1">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
              <span className="leading-relaxed font-medium">{regError}</span>
            </div>
          )}

          {regStep === "details" ? (
            <form onSubmit={handleRequestOtp} className="space-y-3.5 mt-2">
              <div className="text-start">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {lang === "ar" ? "الاسم الكامل *" : "Full Name *"}
                </label>
                <div className="relative">
                  <span className={`absolute inset-y-0 ${lang === "ar" ? "right-0 pr-3" : "left-0 pl-3"} flex items-center pointer-events-none text-slate-400`}>
                    <User className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    required
                    placeholder={lang === "ar" ? "مثال: أحمد محمد" : "e.g. John Doe"}
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    className={`w-full ${lang === "ar" ? "pr-9 pl-3 text-right" : "pl-9 pr-3 text-left"} py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 transition-all`}
                  />
                </div>
              </div>

              <div className="text-start">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {lang === "ar" ? "اسم المستخدم *" : "Username *"}
                </label>
                <div className="relative">
                  <span className={`absolute inset-y-0 ${lang === "ar" ? "right-0 pr-3" : "left-0 pl-3"} flex items-center pointer-events-none text-slate-400`}>
                    <KeyRound className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    required
                    placeholder={lang === "ar" ? "مثال: johndoe" : "e.g. johndoe"}
                    value={regUsername}
                    onChange={(e) => setRegUsername(e.target.value)}
                    className={`w-full ${lang === "ar" ? "pr-9 pl-3 text-right" : "pl-9 pr-3 text-left"} py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 transition-all`}
                  />
                </div>
              </div>

              <div className="text-start">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {lang === "ar" ? "البريد الإلكتروني (Gmail) *" : "Gmail / Email Address *"}
                </label>
                <div className="relative">
                  <span className={`absolute inset-y-0 ${lang === "ar" ? "right-0 pr-3" : "left-0 pl-3"} flex items-center pointer-events-none text-slate-400`}>
                    <Mail className="w-4 h-4" />
                  </span>
                  <input
                    type="email"
                    required
                    placeholder="client@gmail.com"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    className={`w-full ${lang === "ar" ? "pr-9 pl-3 text-right" : "pl-9 pr-3 text-left"} py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 transition-all`}
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  {lang === "ar" ? "سيتم إرسال كود تحقق إلى هذا البريد للتأكد من ملكيته" : "A verification code will be sent to confirm this email"}
                </p>
              </div>

              <div className="text-start">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {lang === "ar" ? "كلمة المرور *" : "Password *"}
                  </label>
                  <span className={`text-[11px] font-medium transition-colors ${
                    regPasswordStrength === "strong"
                      ? "text-emerald-500 font-semibold"
                      : regPasswordStrength === "medium"
                      ? "text-amber-500 font-semibold"
                      : regPasswordStrength === "weak"
                      ? "text-rose-500 font-semibold"
                      : "text-slate-400"
                  }`}>
                    {regPasswordStrength === "strong"
                      ? (lang === "ar" ? "✓ كلمة مرور قوية" : "✓ Strong password")
                      : regPasswordStrength === "medium"
                      ? (lang === "ar" ? "⚠️ كلمة مرور متوسطة" : "⚠️ Medium strength")
                      : regPasswordStrength === "weak"
                      ? (lang === "ar" ? "ضعيفة (8 أحرف على الأقل)" : "Weak: Password must be at least 8 characters long")
                      : (lang === "ar" ? "8 أحرف على الأقل" : "Password must be at least 8 characters long")}
                  </span>
                </div>
                <div className="relative">
                  <span className={`absolute inset-y-0 ${lang === "ar" ? "right-0 pr-3" : "left-0 pl-3"} flex items-center pointer-events-none ${
                    regPasswordStrength === "strong"
                      ? "text-emerald-500"
                      : regPasswordStrength === "medium"
                      ? "text-amber-500"
                      : regPasswordStrength === "weak"
                      ? "text-rose-500"
                      : "text-slate-400"
                  }`}>
                    <Lock className="w-4 h-4" />
                  </span>
                  <input
                    type={showRegPassword ? "text" : "password"}
                    required
                    placeholder="••••••••"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    className={`w-full ${lang === "ar" ? "pr-9 pl-10 text-right" : "pl-9 pr-10 text-left"} py-2.5 bg-slate-50 dark:bg-slate-800 border ${
                      regPasswordStrength === "strong"
                        ? "border-emerald-500 focus:border-emerald-600 focus:ring-emerald-500/20"
                        : regPasswordStrength === "medium"
                        ? "border-amber-500 focus:border-amber-600 focus:ring-amber-500/20"
                        : regPasswordStrength === "weak"
                        ? "border-rose-500 focus:border-rose-600 focus:ring-rose-500/20"
                        : "border-slate-200 dark:border-slate-700 focus:border-blue-600 focus:ring-blue-600/20"
                    } rounded-xl text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 transition-all`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowRegPassword(!showRegPassword)}
                    className={`absolute inset-y-0 ${lang === "ar" ? "left-0 pl-3" : "right-0 pr-3"} flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors cursor-pointer`}
                  >
                    {showRegPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {/* Visual strength bar indicator */}
                {regPassword && (
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <div className="h-1 flex-1 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          regPasswordStrength === "strong"
                            ? "w-full bg-emerald-500"
                            : regPasswordStrength === "medium"
                            ? "w-2/3 bg-amber-500"
                            : "w-1/3 bg-rose-500"
                        }`}
                      />
                    </div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider shrink-0 text-muted-foreground">
                      {regPasswordStrength === "strong"
                        ? (lang === "ar" ? "قوية" : "Strong")
                        : regPasswordStrength === "medium"
                        ? (lang === "ar" ? "متوسطة" : "Medium")
                        : (lang === "ar" ? "ضعيفة" : "Weak")}
                    </span>
                  </div>
                )}
                <p className="text-[11px] text-slate-400 mt-1">
                  {lang === "ar" ? "يجب أن تحتوي على 8 أحرف على الأقل (حرف كبير، حرف صغير، ورقم)" : "Password must be at least 8 characters long (uppercase, lowercase & number)"}
                </p>
              </div>

              <DialogFooter className="pt-3 gap-2 sm:gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsRegisterOpen(false)}
                  disabled={isSendingOtp}
                  className="rounded-xl cursor-pointer"
                >
                  {lang === "ar" ? "إلغاء" : "Cancel"}
                </Button>
                <Button
                  type="submit"
                  disabled={isSendingOtp}
                  className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md shadow-blue-600/25 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isSendingOtp ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{lang === "ar" ? "جاري إرسال الرمز..." : "Sending Code..."}</span>
                    </>
                  ) : (
                    <>
                      <span>{lang === "ar" ? "متابعة وإرسال رمز التحقق" : "Send Verification Code"}</span>
                      {lang === "ar" ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <form onSubmit={handleRegisterSubmit} className="space-y-4 mt-2">
              <div className="text-center py-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  {lang === "ar" ? "أدخل رمز التحقق (6 أرقام) *" : "Enter Verification Code (6 digits) *"}
                </label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  autoFocus
                  placeholder="123456"
                  value={regOtp}
                  onChange={(e) => setRegOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="w-full py-3.5 text-center text-2xl font-bold tracking-[8px] bg-slate-50 dark:bg-slate-800 border-2 border-blue-500/30 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10 transition-all"
                />
                <p className="text-[11px] text-slate-500 mt-2">
                  {lang === "ar"
                    ? "صلاحية رمز التحقق 10 دقائق فقط لحماية حسابك"
                    : "Verification code is valid for 10 minutes only"}
                </p>
              </div>

              <div className="flex items-center justify-between text-xs px-1">
                <button
                  type="button"
                  onClick={() => {
                    setRegStep("details");
                    setRegError(null);
                  }}
                  className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline cursor-pointer"
                >
                  {lang === "ar" ? "تعديل البيانات أو الإيميل" : "Edit details or email"}
                </button>
                {otpCooldown > 0 ? (
                  <span className="text-slate-400 font-medium">
                    {lang === "ar" ? `إعادة الإرسال بعد ${otpCooldown} ث` : `Resend in ${otpCooldown}s`}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleRequestOtp()}
                    disabled={isSendingOtp}
                    className="text-blue-600 hover:text-blue-700 font-semibold cursor-pointer flex items-center gap-1"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSendingOtp ? "animate-spin" : ""}`} />
                    {lang === "ar" ? "إعادة إرسال الرمز" : "Resend Code"}
                  </button>
                )}
              </div>

              <DialogFooter className="pt-3 gap-2 sm:gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setRegStep("details")}
                  disabled={isRegistering}
                  className="rounded-xl cursor-pointer"
                >
                  {lang === "ar" ? "رجوع" : "Back"}
                </Button>
                <Button
                  type="submit"
                  disabled={isRegistering || regOtp.length !== 6}
                  className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md shadow-blue-600/25 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isRegistering ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{lang === "ar" ? "جاري التحقق والإنشاء..." : "Verifying & Creating..."}</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{lang === "ar" ? "تأكيد وإنشاء الحساب" : "Verify & Create Account"}</span>
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
