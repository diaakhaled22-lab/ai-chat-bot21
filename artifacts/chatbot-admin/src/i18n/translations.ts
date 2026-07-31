export type Lang = "en" | "ar";

const translations = {
  en: {
    // Nav
    nav_dashboard: "Dashboard",
    nav_clients: "Clients",
    nav_companies: "Companies",
    nav_chat_logs: "Chat Logs",
    nav_customer_problems: "Customer Problems",
    nav_settings: "Settings",
    nav_company: "Company",
    nav_support: "Support",
    nav_api_tokens: "API Tokens",
    nav_sign_out: "Sign Out",
    nav_admin_portal: "Admin Portal",
    nav_client_portal: "Client Portal",
    nav_live: "Live",
    nav_today: "today",

    // Notifications
    notif_title: "Notifications",
    notif_renewal_reminders: "Renewal Reminders",
    notif_customer_problems: "Customer Problems",
    notif_open: "open",
    notif_no_problems: "No pending problems",
    notif_no_notifications: "All clear — no notifications",
    notif_view_all: "View all problems →",
    notif_loading: "Loading…",
    notif_new: "new",
    notif_client_no_notifications: "No notifications",

    // Settings page - Admin
    admin_settings_title: "Admin Settings",
    admin_settings_desc: "Manage global configuration and security.",
    settings_email_notif: "Email Notifications",
    settings_support_ai: "Support AI",
    settings_security: "Security",
    settings_security_desc: "Update your username and password.",
    settings_language: "Language",
    settings_language_desc: "Choose the display language for the platform.",
    settings_lang_english: "English",
    settings_lang_arabic: "Arabic (عربي)",
    settings_lang_applied: "Language updated",
    settings_lang_applied_desc: "The platform will display in",

    // Settings page - Client
    client_settings_title: "Settings",
    client_settings_desc: "Manage your account and preferences.",
    settings_security_client_desc: "Update your password.",

    // Common form labels
    label_username: "Username",
    label_current_password: "Current Password",
    label_new_password: "New Password",
    label_new_password_optional: "New Password (optional)",
    btn_save_password: "Save Password",
    btn_save_changes: "Save Changes",
    btn_saving: "Saving...",

    // Loading
    loading: "Loading...",
  },
  ar: {
    // Nav
    nav_dashboard: "لوحة التحكم",
    nav_clients: "العملاء",
    nav_companies: "الشركات",
    nav_chat_logs: "سجلات المحادثة",
    nav_customer_problems: "مشاكل العملاء",
    nav_settings: "الإعدادات",
    nav_company: "الشركة",
    nav_support: "الدعم",
    nav_api_tokens: "رموز API",
    nav_sign_out: "تسجيل الخروج",
    nav_admin_portal: "بوابة المسؤول",
    nav_client_portal: "بوابة العميل",
    nav_live: "مباشر",
    nav_today: "اليوم",

    // Notifications
    notif_title: "الإشعارات",
    notif_renewal_reminders: "تذكيرات التجديد",
    notif_customer_problems: "مشاكل العملاء",
    notif_open: "مفتوح",
    notif_no_problems: "لا توجد مشاكل معلقة",
    notif_no_notifications: "لا توجد إشعارات",
    notif_view_all: "← عرض جميع المشاكل",
    notif_loading: "جاري التحميل…",
    notif_new: "جديد",
    notif_client_no_notifications: "لا توجد إشعارات",

    // Settings page - Admin
    admin_settings_title: "إعدادات المسؤول",
    admin_settings_desc: "إدارة التكوين العام والأمان.",
    settings_email_notif: "إشعارات البريد الإلكتروني",
    settings_support_ai: "الذكاء الاصطناعي للدعم",
    settings_security: "الأمان",
    settings_security_desc: "تحديث اسم المستخدم وكلمة المرور.",
    settings_language: "اللغة",
    settings_language_desc: "اختر لغة العرض للمنصة.",
    settings_lang_english: "الإنجليزية",
    settings_lang_arabic: "العربية (Arabic)",
    settings_lang_applied: "تم تحديث اللغة",
    settings_lang_applied_desc: "ستُعرض المنصة باللغة",

    // Settings page - Client
    client_settings_title: "الإعدادات",
    client_settings_desc: "إدارة حسابك وتفضيلاتك.",
    settings_security_client_desc: "تحديث كلمة المرور الخاصة بك.",

    // Common form labels
    label_username: "اسم المستخدم",
    label_current_password: "كلمة المرور الحالية",
    label_new_password: "كلمة المرور الجديدة",
    label_new_password_optional: "كلمة المرور الجديدة (اختياري)",
    btn_save_password: "حفظ كلمة المرور",
    btn_save_changes: "حفظ التغييرات",
    btn_saving: "جاري الحفظ...",

    // Loading
    loading: "جاري التحميل...",
  },
} as const;

export type TranslationKey = keyof typeof translations.en;
export { translations };
