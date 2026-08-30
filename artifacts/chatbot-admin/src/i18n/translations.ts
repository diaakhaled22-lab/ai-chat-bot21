export type Lang = "en" | "ar";

const translations = {
  en: {
    // ── Navigation ──────────────────────────────────────────────────────────
    nav_dashboard: "Dashboard",
    nav_clients: "Clients",
    nav_companies: "Companies",
    nav_chat_logs: "Chat Logs",
    nav_customer_problems: "Customer Problems",
    nav_settings: "Settings",
    nav_prompts: "Prompts",
    nav_company: "Company Profile",
    nav_channels: "Channels",
    nav_wordpress: "WordPress Integration",
    nav_webhook_history: "Webhook History",
    nav_widget_preview: "Live Widget Preview",
    nav_universal_chat: "AI Chat",
    nav_support: "Support & Tickets",
    nav_api_tokens: "API Tokens & Quota",
    nav_broadcast: "Broadcast",
    nav_webhook_messenger: "Webhook Channels",
    nav_ai_tester: "AI Tester",
    nav_security: "Security Settings",
    nav_sign_out: "Sign Out",
    nav_admin_portal: "Admin Portal",
    nav_client_portal: "Client Portal",
    nav_live: "Live",
    nav_today: "today",
    nav_mission_control: "Mission Control",

    // ── Notifications ───────────────────────────────────────────────────────
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

    // ── Common Actions & UI ─────────────────────────────────────────────────
    loading: "Loading...",
    btn_save: "Save",
    btn_save_changes: "Save Changes",
    btn_saving: "Saving...",
    btn_saved: "Saved successfully",
    btn_cancel: "Cancel",
    btn_delete: "Delete",
    btn_edit: "Edit",
    btn_refresh: "Refresh",
    btn_copy: "Copy",
    btn_copied: "Copied!",
    btn_close: "Close",
    btn_send: "Send",
    btn_test: "Test Connection",
    btn_testing: "Testing...",
    btn_sync_now: "Sync Now",
    btn_syncing: "Syncing...",
    btn_clear: "Clear",
    btn_reset: "Reset",
    btn_upload: "Upload",
    status_active: "Active",
    status_inactive: "Inactive",
    status_connected: "Connected",
    status_not_configured: "Not configured",
    status_pending: "Pending",
    status_error: "Error",
    status_resolved: "Resolved",
    status_open: "Open",
    status_ready: "Ready",
    status_processing: "Processing...",

    // ── Common Form Labels ──────────────────────────────────────────────────
    label_full_name: "Full Name",
    label_username: "Username",
    label_current_password: "Current Password",
    label_new_password: "New Password",
    label_new_password_optional: "New Password (optional)",
    btn_view_details: "View Details",
    btn_set_quota: "Set Token Quota",
    btn_test_ai: "Test AI Connection",
    btn_edit_prompts: "Edit System & Security Prompts",
    btn_sub_settings: "Subscription Settings",
    btn_reg_telegram: "Register Telegram Webhook",
    btn_delete_company: "Delete Company",
    btn_save_password: "Save Password",

    // ── Client Settings Page ────────────────────────────────────────────────
    client_settings_title: "Settings",
    client_settings_desc: "Manage your account credentials and language preferences.",
    settings_security: "Security & Password",
    settings_security_desc: "Update your login password and account credentials.",
    settings_security_client_desc: "Update your password and username.",
    settings_saved_success: "Configuration saved successfully.",
    settings_language: "Language",
    settings_language_desc: "Choose the display language for the dashboard.",
    settings_lang_english: "English",
    settings_lang_arabic: "العربية (Arabic)",
    settings_lang_applied: "Language updated",
    settings_lang_applied_desc: "The platform will display in",
    admin_settings_title: "Admin Settings",
    admin_settings_desc: "Manage global configuration and security.",
    settings_email_notif: "Email Notifications",
    settings_support_ai: "Support AI",

    // ── Client Channels Page ────────────────────────────────────────────────
    channels_title: "Communication Channels",
    channels_desc: "Connect your AI assistant to Telegram, WhatsApp, Messenger, and your Website.",
    channels_telegram_title: "Telegram Bot",
    channels_telegram_desc: "Connect your AI agent to a Telegram Bot via BotFather token.",
    channels_telegram_token: "Telegram Bot Token",
    channels_telegram_token_placeholder: "123456789:ABCdefGHIjklMNOpqrsTUVwxyz",
    channels_telegram_auto_webhook: "Webhook is registered automatically upon saving.",
    channels_telegram_link: "Your Telegram Bot Link",
    channels_whatsapp_title: "WhatsApp Business (Cloud API)",
    channels_whatsapp_desc: "Connect your official WhatsApp Business account via Meta Cloud API.",
    channels_whatsapp_token: "System User Access Token",
    channels_whatsapp_phone_id: "Phone Number ID",
    channels_whatsapp_account_id: "WhatsApp Business Account ID (WABA ID)",
    channels_whatsapp_display_number: "Display Phone Number",
    channels_messenger_title: "Facebook Messenger",
    channels_messenger_desc: "Connect your Facebook Page so AI responds to Messenger inquiries automatically.",
    channels_messenger_token: "Page Access Token",
    channels_messenger_page_id: "Facebook Page ID",
    channels_website_title: "Website Live Chat Widget",
    channels_website_desc: "Embed an interactive chat bubble directly onto your website.",
    channels_website_key: "Website Secret Key",
    channels_website_fab_toggle: "Enable Floating Action Button (FAB)",
    channels_website_fab_position: "FAB Position on Screen",
    channels_website_fab_hint: "Drag the chat button below to adjust its position on your website.",

    // ── Client Company Profile Page ─────────────────────────────────────────
    company_title: "Company Profile & AI",
    company_desc: "Configure your company information, AI provider, and knowledge base.",
    company_info_card: "Basic Information",
    company_name_label: "Company Name",
    company_general_info_label: "Company Information & Overview",
    company_general_info_placeholder: "Describe your business, products, services, working hours, address...",
    company_ai_card: "AI Model & Provider",
    company_ai_desc: "Select your preferred AI provider and enter your API key.",
    company_ai_provider: "AI Provider",
    company_ai_model: "AI Model",
    company_ai_key: "API Key",
    company_system_prompt: "Custom System Instructions (Prompt)",
    company_security_prompt: "Custom System Instructions (Prompt) Security",
    company_system_prompt_desc: "Define the personality, language, and behavior rules for your AI chatbot.",
    company_security_prompt_desc: "Define the security constraints and boundaries for your AI chatbot.",
    company_system_prompt_placeholder: "Enter custom instructions for how the AI assistant should behave...",
    company_security_prompt_placeholder: "Enter security instructions...",
    company_knowledge_files: "Uploaded Knowledge Files",
    company_knowledge_files_desc: "Upload PDFs, Excel sheets, CSVs, or JSON files to feed your AI with custom knowledge.",
    company_drop_files: "Drag & drop files here or click to browse",
    company_allowed_files: "Supported formats: PDF, XLSX, XLS, CSV, JSON (max 50MB)",
    company_google_sheets: "Google Sheets Integration",
    company_google_sheets_desc: "Connect a Google Sheet to record customer leads and conversation data automatically.",
    company_gs_enable: "Enable Google Sheets Integration",
    company_gs_link: "Google Spreadsheet Link",
    company_gs_tab: "Sheet Tab Name (Optional)",
    company_gs_json_key: "Service Account JSON Key",
    company_website_sync: "Website Content Sync (Scraping)",
    company_website_sync_desc: "Automatically scrape and sync information from your public website.",
    company_website_url: "Website URL to scrape",
    company_website_url_desc: "Enter your public website URL for the AI to crawl and learn from.",
    company_website_autosync: "Auto-sync website content periodically",
    company_website_autosync_desc: "Automatically re-crawl and refresh cached website knowledge daily.",

    // ── Client WordPress Page ───────────────────────────────────────────────
    wp_title: "WordPress Integration",
    wp_desc: "Connect your WordPress site to automatically sync your posts, pages, and products into the AI knowledge base.",
    wp_api_url: "WordPress REST API URL",
    wp_api_url_placeholder: "https://example.com/wp-json/",
    wp_username: "WordPress Username (Optional)",
    wp_app_password: "Application Password (Optional)",
    wp_app_password_desc: "Generated in WordPress Users > Profile > Application Passwords.",
    wp_autosync: "Enable daily auto-sync",
    wp_sync_stats: "Synced Content Summary",
    wp_total_items: "Total items synced",
    wp_last_synced: "Last synced",
    wp_disconnect: "Remove WordPress Integration",

    // ── Client Webhook History Page ─────────────────────────────────────────
    webhook_title: "Webhook Integration",
    webhook_desc: "Connect custom backends or bots directly to the AI Chat API endpoint.",
    webhook_endpoint_label: "Public Webhook Endpoint",
    webhook_phase1_title: "Phase 1: Fetch AI Context (Before Generating Reply)",
    webhook_phase1_desc: "Send customerMessage only. The API returns the system prompt and conversation history without saving anything.",
    webhook_phase2_title: "Phase 2: Save Complete Turn (After Generating Reply)",
    webhook_phase2_desc: "Send customerMessage and botResponse together to log the conversation permanently.",

    // ── Client Widget Preview Page ──────────────────────────────────────────
    widget_preview_title: "Live Widget Preview",
    widget_preview_desc: "Test your website chat widget in real-time before embedding it on your site.",
    widget_preview_snippet_title: "Embed Code Snippet",
    widget_preview_snippet_desc: "Paste this single script tag right before the closing </body> tag on your website:",
    widget_preview_reset: "Reset conversation",
    widget_preview_inactive: "Your company is currently inactive. Please contact support or your admin.",
    widget_preview_no_ai: "AI is not configured yet. Please configure your AI key in Company Profile.",

    // ── Client Universal AI Chat Page ───────────────────────────────────────
    universal_chat_title: "AI Chat Sandbox",
    universal_chat_desc: "Test and interact with multiple AI models in real-time.",
    universal_chat_select_model: "Select Provider & Model",
    universal_chat_placeholder: "Type a message to test the AI...",
    universal_chat_clear: "Clear Chat History",
    universal_chat_free_badge: "Free Tier",
    universal_chat_paid_badge: "Standard",

    // ── Client Chat Logs Page ───────────────────────────────────────────────
    chat_logs_title: "Chat Logs",
    chat_logs_desc: "View and filter all conversations handled by your AI chatbot across all channels.",
    chat_logs_search: "Search messages or responses...",
    chat_logs_filter_channel: "All Channels",
    chat_logs_channel_all: "All Channels",
    chat_logs_channel_website: "Website",
    chat_logs_channel_telegram: "Telegram",
    chat_logs_channel_whatsapp: "WhatsApp",
    chat_logs_channel_messenger: "Messenger",
    chat_logs_date_from: "From Date",
    chat_logs_date_to: "To Date",
    chat_logs_retention_title: "Data Retention Policy",
    chat_logs_retention_desc: "Chat logs older than the selected retention period will be automatically deleted.",
    chat_logs_retention_days: "days",
    chat_logs_retention_admin_managed: "Configured by Administrator",
    chat_logs_empty: "No chat logs found matching your filters.",
    chat_logs_customer: "Customer",
    chat_logs_bot: "AI Assistant",

    // ── Admin Company Retention Policy ──────────────────────────────────────


    // Admin Dashboard
    admin_dash_title: "Dashboard Overview",
    admin_dash_desc: "Platform statistics and metrics.",
    admin_dash_stat_companies: "Total Companies",
    admin_dash_stat_active: "Active Companies",
    
    // Admin Clients
    admin_clients_title: "Clients",
    admin_clients_desc: "Manage client accounts and their access to the portal.",
    
    // Admin Chat Logs
    admin_logs_title: "Chat Logs",
    admin_logs_desc: "View across all companies",
    
    // Admin Tickets
    admin_tickets_title: "Customer Problems",
    admin_tickets_desc: "Monitor and manage AI escalations from all channels.",
    
    // Admin Broadcast
    admin_broadcast_title: "Broadcast",
    admin_broadcast_desc: "Send bulk messages",
    
    // Admin Security
    admin_security_title: "Security Settings",
    admin_security_desc: "Manage platform security, API keys, and sensitive configuration.",


    // Admin Dashboard
    
    // Admin Clients
    
    // Admin Chat Logs
    
    // Admin Tickets
    
    // Admin Broadcast
    
    // Admin Security

    // Admin Companies
    admin_companies_title: "Companies",
    admin_companies_desc: "Monitor subscriptions, channels, and AI agent health across all client companies.",
    admin_comp_stat_total: "Total Companies",
    admin_comp_stat_active: "Active",
    admin_comp_stat_inactive: "Inactive",
    admin_comp_stat_expiring: "Expiring Soon",
    admin_comp_stat_within_7d: "Within 7 days",
    admin_comp_search: "Search by company or client name...",
    admin_comp_tab_all: "All",
    admin_comp_tab_active: "Active",
    admin_comp_tab_inactive: "Inactive",
    admin_comp_tab_expiring: "Expiring Soon",
    admin_comp_th_myid: "MY ID",
    admin_comp_th_company: "COMPANY",
    admin_comp_th_company_name: "COMPANY NAME",
    admin_comp_th_client: "CLIENT",
    admin_comp_th_status: "STATUS",
    admin_comp_th_start_date: "START DATE",
    admin_comp_th_end_date: "END DATE",
    admin_comp_th_channels: "CHANNELS",
    admin_comp_th_quota: "QUOTA",
    admin_comp_th_autodelete: "AUTO-DELETE",
    admin_comp_th_actions: "ACTIONS",
    admin_comp_no_companies: "No companies found",
    admin_comp_no_companies_desc: "Try a different search term",
    admin_comp_unlimited: "Unlimited",

    // Admin Companies
    admin_companies_retention_menu: "Auto-Delete Policy",
    admin_companies_retention_dialog_title: "Auto-Delete Retention Policy",
    admin_companies_retention_dialog_desc: "Configure automatic chat log deletion for this company. Logs older than the chosen period are permanently deleted.",
    admin_companies_retention_days_label: "Retention Period (in Days)",
    admin_companies_retention_days_placeholder: "e.g. 30",
    admin_companies_retention_presets: "Quick Presets",
    admin_companies_retention_global_hint: "Global system default:",
    admin_companies_retention_reset: "Reset to Global System Default",
    admin_companies_retention_custom: "days",
    admin_companies_retention_badge_custom: "Auto-deletes after",
    admin_companies_retention_badge_default: "System Default",
    admin_companies_retention_saved: "Auto-delete policy updated successfully.",

    // ── Client Support / Tickets Page ───────────────────────────────────────
    support_title: "Support & Problem Reports",
    support_desc: "Need help? Submit a ticket to the platform administrator.",
    support_new_ticket: "New Problem Ticket",
    support_ticket_title: "Problem Title",
    support_ticket_title_placeholder: "Briefly describe the issue...",
    support_ticket_desc: "Detailed Description",
    support_ticket_desc_placeholder: "Provide steps to reproduce or more details...",
    support_submit_ticket: "Submit Ticket",
    support_no_tickets: "No tickets submitted yet.",
    support_your_problem: "Your Problem Report",
    support_ai_solution: "AI Generated Solution from Admin",
    support_admin_pending: "Admin will review and respond shortly.",
    support_resolved: "Resolved",
    support_pending: "Pending",

    // ── Client Usage & Tokens Page ──────────────────────────────────────────
    usage_title: "Token Usage & Cost",
    usage_desc: "Monitor your token consumption and estimated AI API usage costs.",
    usage_stat_messages: "Total Messages",
    usage_stat_input_tokens: "Input Tokens",
    usage_stat_output_tokens: "Output Tokens",
    usage_stat_cost: "Estimated Cost",
    usage_period_today: "Today",
    usage_period_week: "This Week",
    usage_period_month: "This Month",
    usage_period_last_month: "Last Month",
    usage_period_all: "All Time",
    usage_quota_title: "Monthly Token Quota",
    usage_quota_used: "used this month",
    usage_channel_breakdown: "Usage by Channel",
    usage_tokens_chart: "Token Distribution",

    // ── Get Data & Knowledge Sources ─────────────────────────────────────────
    get_data_title: "Knowledge & Data Sources",
    get_data_button: "Get Data",
    get_data_desc: "Connect, upload, and sync external data sources to feed your AI chatbot.",
    data_source_website: "Website URL",
    data_source_website_desc: "Scrape & sync content directly from your website pages.",
    data_source_files: "Uploaded Knowledge Files",
    data_source_files_desc: "Upload PDF, Excel, CSV, or JSON documents for instant AI knowledge.",
    data_source_wordpress: "WordPress",
    data_source_wordpress_desc: "Connect via WordPress REST API to sync posts, pages, and products.",
  },
  ar: {
    // ── Navigation ──────────────────────────────────────────────────────────

    // ── Notifications ───────────────────────────────────────────────────────

    // ── Common Actions & UI ─────────────────────────────────────────────────

    // ── Common Form Labels ──────────────────────────────────────────────────

    // ── Client Settings Page ────────────────────────────────────────────────

    // ── Client Channels Page ────────────────────────────────────────────────

    // ── Client Company Profile Page ─────────────────────────────────────────

    // ── Client WordPress Page ───────────────────────────────────────────────

    // ── Client Webhook History Page ─────────────────────────────────────────

    // ── Client Widget Preview Page ──────────────────────────────────────────

    // ── Client Universal AI Chat Page ───────────────────────────────────────

    // ── Client Chat Logs Page ───────────────────────────────────────────────

    // ── Admin Company Retention Policy ──────────────────────────────────────

    // ── Client Support / Tickets Page ───────────────────────────────────────

    // ── Client Usage & Tokens Page ──────────────────────────────────────────

    // ── Get Data & Knowledge Sources ─────────────────────────────────────────
  },
} as const;

export type TranslationKey = keyof typeof translations.en;
export { translations };

