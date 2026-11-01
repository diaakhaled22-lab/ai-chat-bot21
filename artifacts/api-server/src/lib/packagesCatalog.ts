export interface PackageItem {
  id: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  monthlyPriceUsd: number;
  tokensMonthly: number;
  tokensFormatted?: string;
  popular?: boolean;
  color?: string;
  badgeAr?: string;
  badgeEn?: string;
  featuresAr: string[];
  featuresEn: string[];
  allowedPages?: string[];
  retentionDays?: number | null;
  channels?: string[];
  tools?: string[];
  isActive?: boolean;
  sortOrder?: number;
}

export interface TopupPackItem {
  id?: string;
  tokens: number;
  formatted: string;
  priceUsd: number;
  isActive?: boolean;
}

export interface PackagesCatalog {
  packages: PackageItem[];
  topupPacks: TopupPackItem[];
  updatedAt?: string;
}

export const DEFAULT_PACKAGES_CATALOG: PackagesCatalog = {
  packages: [
    {
      id: "starter",
      nameAr: "الباقة الأساسية (Starter)",
      nameEn: "Starter Plan",
      descriptionAr: "مثالية للمشاريع الناشئة والشركات الصغيرة لبدء أتمتة الردود وخدمة العملاء.",
      descriptionEn: "Perfect for startups and small businesses starting with AI automation.",
      monthlyPriceUsd: 29,
      tokensMonthly: 50_000,
      tokensFormatted: "50,000",
      popular: false,
      color: "#3b82f6",
      badgeAr: "",
      badgeEn: "",
      featuresAr: [
        "50,000 رمز شهرياً (AI Tokens)",
        "قناتين: ويدجت الموقع الإلكتروني + بوت تليجرام",
        "قاعدة معارف ذكية (حتى 5 مستندات/ملفات)",
        "سجلات المحادثة المباشرة",
        "إشعارات البريد الإلكتروني للتنبيهات",
        "دعم فني عبر التذاكر (خلال 24 ساعة)",
      ],
      featuresEn: [
        "50,000 monthly AI Tokens",
        "2 Channels: Website Widget + Telegram Bot",
        "Smart Knowledge Base (up to 5 documents)",
        "Real-time Chat Logs",
        "Email notifications & alerts",
        "Ticket support (response within 24h)",
      ],
      allowedPages: [
        "dashboard",
        "notifications",
        "company",
        "packages",
        "ai_model",
        "usage",
        "knowledge",
        "channels",
        "widget_preview",
        "support",
        "malfunctions",
        "settings",
      ],
      retentionDays: 7,
      channels: ["widget", "telegram"],
      tools: ["leads_crm"],
      isActive: true,
      sortOrder: 1,
    },
    {
      id: "pro",
      nameAr: "الباقة الاحترافية (Professional)",
      nameEn: "Professional Plan",
      descriptionAr: "الخيار الأفضل للعيادات والشركات المتنامية مع ربط كامل بالقنوات والتقويم.",
      descriptionEn: "Best for growing companies and clinics needing multi-channel CRM & booking.",
      monthlyPriceUsd: 79,
      tokensMonthly: 250_000,
      tokensFormatted: "250,000",
      popular: true,
      color: "#2D5BE3",
      badgeAr: "الأكثر طلباً",
      badgeEn: "Most Popular",
      featuresAr: [
        "250,000 رمز شهرياً (AI Tokens)",
        "جميع القنوات: موقع + تليجرام + واتساب + ماسنجر",
        "قاعدة معارف غير محدودة (مستندات، روابط، مواقع)",
        "تكامل تقويم Google وجداول Google للحجوزات",
        "نظام إدارة العملاء المحتملين والحجوزات (Leads CRM)",
        "صندوق الوارد الموحد والتحويل لموظف بشري (Handoff)",
        "دعم فني أولوية عبر التذاكر والشات المباشر",
      ],
      featuresEn: [
        "250,000 monthly AI Tokens",
        "All channels: Website + Telegram + WhatsApp + Messenger",
        "Unlimited Knowledge Base (docs, links, scrapers)",
        "Google Calendar & Google Sheets integration",
        "Leads & Appointments CRM tracking",
        "Universal Chat Inbox with Human Handoff",
        "Priority technical support & instant alerts",
      ],
      allowedPages: [
        "dashboard",
        "notifications",
        "company",
        "packages",
        "ai_model",
        "usage",
        "knowledge",
        "channels",
        "tools",
        "chat_logs",
        "leads",
        "universal_chat",
        "widget_preview",
        "support",
        "malfunctions",
        "settings",
      ],
      retentionDays: 30,
      channels: ["widget", "telegram", "whatsapp", "messenger"],
      tools: ["calendar", "sheets", "leads_crm", "handoff", "web_sync"],
      isActive: true,
      sortOrder: 2,
    },
    {
      id: "enterprise",
      nameAr: "باقة الشركات الكبرى (Enterprise)",
      nameEn: "Enterprise Plan",
      descriptionAr: "للمؤسسات والمنصات ذات الاستهلاك العالي التي تتطلب أداءً فائقاً وتخصيصاً كاملاً.",
      descriptionEn: "For enterprises requiring high throughput, custom integrations, and SLA.",
      monthlyPriceUsd: 199,
      tokensMonthly: 1_000_000,
      tokensFormatted: "1,000,000",
      popular: false,
      color: "#8b5cf6",
      badgeAr: "أعلى أداء",
      badgeEn: "Top Performance",
      featuresAr: [
        "1,000,000 رمز شهرياً (AI Tokens)",
        "جميع ميزات الباقة الاحترافية بالكامل",
        "قنوات الويب هوك المخصصة (Custom Webhooks & REST API)",
        "تخصيص كامل للتوجيهات وأنظمة حماية البيانات (Prompt Security)",
        "إمكانية استخدام مفتاح API خاص أو حصة المنصة",
        "مدير حساب مخصص ومتابعة دورية للأداء",
        "اتفاقية مستوى الخدمة SLA بنسبة جاهزية 99.9%",
      ],
      featuresEn: [
        "1,000,000 monthly AI Tokens",
        "All Professional Plan features included",
        "Custom Webhooks & REST API channel integrations",
        "Custom prompt engineering & enterprise prompt security",
        "Flexibility: Own API keys or platform managed quota",
        "Dedicated account manager & performance review",
        "99.9% uptime Service Level Agreement (SLA)",
      ],
      allowedPages: [
        "dashboard",
        "notifications",
        "company",
        "packages",
        "ai_model",
        "usage",
        "knowledge",
        "channels",
        "tools",
        "chat_logs",
        "leads",
        "universal_chat",
        "widget_preview",
        "support",
        "malfunctions",
        "webhook_history",
        "settings",
      ],
      retentionDays: 90,
      channels: ["widget", "telegram", "whatsapp", "messenger", "webhook"],
      tools: ["calendar", "sheets", "leads_crm", "handoff", "voice", "web_sync"],
  ],
  topupPacks: [
    { id: "topup-25k", tokens: 25_000, formatted: "+25K", priceUsd: 5, isActive: true },
    { id: "topup-50k", tokens: 50_000, formatted: "+50K", priceUsd: 10, isActive: true },
    { id: "topup-100k", tokens: 100_000, formatted: "+100K", priceUsd: 18, isActive: true },
    { id: "topup-250k", tokens: 250_000, formatted: "+250K", priceUsd: 40, isActive: true },
  ],
};
