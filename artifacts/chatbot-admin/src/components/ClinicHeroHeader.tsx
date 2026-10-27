import React from "react";
import { useLocation, Link } from "wouter";
import { useLanguage } from "@/hooks/use-language";
import {
  Stethoscope,
  Sparkles,
  CalendarCheck,
  HeartPulse,
  UserCheck,
  Building2,
  Clock,
  ArrowRight,
  ArrowLeft,
  type LucideIcon,
} from "lucide-react";

export interface ClinicHeroHeaderProps {
  companyName?: string;
  title?: string;
  subtitle?: string;
  icon?: LucideIcon | string;
  badgeText?: string;
  actionText?: string;
  actionHref?: string;
  children?: React.ReactNode;
}

export function ClinicHeroHeader({
  companyName,
  title,
  subtitle,
  icon: CustomIcon,
  badgeText,
  actionText,
  actionHref,
  children,
}: ClinicHeroHeaderProps) {
  const { lang } = useLanguage();
  const [location] = useLocation();

  const isLeadsPage = location === "/client/leads";
  const ArrowIcon = lang === "ar" ? ArrowLeft : ArrowRight;

  const defaultTitle =
    lang === "ar"
      ? "منظومة الرعاية الصحية والحجوزات الطبية"
      : "Healthcare Operations & Clinic Appointments";

  const defaultSubtitle =
    lang === "ar"
      ? "إدارة مواعيد الكشف، متابعة المرضى، وتنسيق استفسارات العيادة عبر الذكاء الاصطناعي وكافة القنوات المعتمدة."
      : "Automated patient bookings, consultation scheduling, and medical inquiry handling across all connected channels.";

  const defaultBadge =
    lang === "ar"
      ? "نظام إدارة العيادات والمراكز الطبية الذكي"
      : "Smart Clinic & Healthcare Medical Portal";

  return (
    <div
      className="relative overflow-hidden rounded-3xl p-5 sm:p-7 text-white shadow-xl shadow-teal-900/20 border border-teal-200/20 mb-6 transition-all"
      style={{
        background: "linear-gradient(135deg, #0d5f57 0%, #0f766e 40%, #0d9488 75%, #14b8a6 100%)",
      }}
    >
      {/* Decorative ambient glowing orbs */}
      <div className="absolute -right-12 -bottom-12 w-72 h-72 bg-teal-200/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute right-48 -top-12 w-56 h-56 bg-cyan-300/20 rounded-full blur-2xl pointer-events-none" />
      <div className="absolute left-8 -bottom-10 w-48 h-48 bg-emerald-300/15 rounded-full blur-2xl pointer-events-none" />

      <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-5 sm:gap-6">
        {/* Left: Icon & Title & Description */}
        <div className="flex items-center gap-3.5 sm:gap-5 min-w-0">
          <div className="w-13 h-13 sm:w-16 sm:h-16 rounded-2xl bg-white/15 backdrop-blur-md border border-white/25 shadow-[inset_0_0_0_2px_rgba(255,255,255,0.18)] flex items-center justify-center shrink-0">
            {CustomIcon ? (
              typeof CustomIcon === "string" ? (
                <i className={`${CustomIcon} text-2xl sm:text-3xl text-white drop-shadow-sm`}></i>
              ) : (
                <CustomIcon className="w-7 h-7 sm:w-8 sm:h-8 text-white drop-shadow-sm" />
              )
            ) : (
              <Stethoscope className="w-7 h-7 sm:w-8 sm:h-8 text-white drop-shadow-sm" />
            )}
          </div>
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-[11px] font-semibold text-white/95 mb-1.5 border border-white/20">
              <Sparkles className="w-3 h-3 text-amber-300 shrink-0" />
              <span>
                {companyName ? `${companyName} • ` : ""}
                {badgeText || defaultBadge}
              </span>
            </div>

            <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight text-white leading-tight drop-shadow-sm truncate">
              {title || defaultTitle}
            </h1>

            <p className="text-xs sm:text-sm text-teal-50/95 mt-1 max-w-2xl leading-relaxed">
              {subtitle || defaultSubtitle}
            </p>
          </div>
        </div>

        {/* Right: Actions / Mode Badge */}
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 w-full lg:w-auto shrink-0 justify-start lg:justify-end">
          {children}

          {/* Clinic Mode Active Badge */}
          <div className="bg-black/25 px-3.5 py-2 rounded-2xl border border-white/20 backdrop-blur-md flex items-center gap-2 text-white">
            <HeartPulse className="w-4 h-4 text-rose-300 shrink-0 animate-pulse" />
            <span className="text-xs font-semibold whitespace-nowrap">
              {lang === "ar" ? "قطاع الرعاية الطبية (مفعّل)" : "Clinic Mode Active"}
            </span>
          </div>

          {/* Quick link button */}
          {actionHref && actionText ? (
            <Link
              href={actionHref}
              className="inline-flex items-center gap-1.5 bg-white text-teal-900 hover:bg-white/90 font-bold px-3.5 py-2 rounded-xl text-xs sm:text-sm shadow-md transition-all shrink-0 cursor-pointer"
            >
              <span>{actionText}</span>
              <ArrowIcon className="w-3.5 h-3.5 ms-0.5" />
            </Link>
          ) : !isLeadsPage ? (
            <Link
              href="/client/leads"
              className="inline-flex items-center gap-1.5 bg-white text-teal-900 hover:bg-white/90 font-bold px-3.5 py-2 rounded-xl text-xs sm:text-sm shadow-md transition-all shrink-0 cursor-pointer"
            >
              <CalendarCheck className="w-4 h-4 text-teal-700" />
              <span>{lang === "ar" ? "سجل المرضى والحجوزات" : "Appointments CRM"}</span>
              <ArrowIcon className="w-3.5 h-3.5 ms-0.5" />
            </Link>
          ) : (
            <div className="bg-white/15 px-3 py-1.5 rounded-xl border border-white/25 text-white text-xs font-medium flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5 text-teal-200" />
              <span>{lang === "ar" ? "أنت في صفحة الحجوزات" : "On Appointments Page"}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ClinicHeroHeader;
