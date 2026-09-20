import re

with open('artifacts/chatbot-admin/src/pages/admin/AdminCompanies.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Hoist isChannelConnected outside of ChannelBadges
old_channel_badges_start = '''// -- Channel badges -------------------------------------------------------------
function ChannelBadges({ company }: { company: Company }) {
  const isChannelConnected = (key: string, enabled: boolean) => {
    if (!enabled) return false;
    switch (key) {
      case "telegram": return !!company.telegramBotApiKey;
      case "whatsapp": return !!(company.whatsappApiToken && company.whatsappPhoneNumberId);
      case "messenger": return !!(company.messengerApiKey && company.messengerPageId);
      case "sheets": return !!company.googleSheetsLink;
      case "web": return true; 
      case "ai": return !!company.aiAgentApiKey;
      default: return false;
    }
  };'''

new_channel_badges_start = '''// -- Channel badges -------------------------------------------------------------
function isChannelConnected(company: Company, key: string, enabled: boolean) {
  if (!enabled) return false;
  switch (key) {
    case "telegram": return !!company.telegramBotApiKey;
    case "whatsapp": return !!(company.whatsappApiToken && company.whatsappPhoneNumberId);
    case "messenger": return !!(company.messengerApiKey && company.messengerPageId);
    case "sheets": return !!company.googleSheetsLink;
    case "web": return true; 
    case "ai": return !!company.aiAgentApiKey;
    default: return false;
  }
}

function ChannelBadges({ company }: { company: Company }) {'''

content = content.replace(old_channel_badges_start, new_channel_badges_start)

# 2. Fix the calls inside ChannelBadges
old_channels_array = '''  const channels = [
    { key: "web",      active: isChannelConnected("web", !!company.widgetEnabled),    icon: <Globe className="w-3 h-3" />,  label: "Website"  },
    { key: "telegram", active: isChannelConnected("telegram", !!company.telegramEnabled),  icon: <Send className="w-3 h-3" />,   label: "Telegram" },
    { key: "whatsapp", active: isChannelConnected("whatsapp", !!company.whatsappEnabled),  icon: <Phone className="w-3 h-3" />,   label: "WhatsApp" },
    { key: "messenger",active: isChannelConnected("messenger", !!company.messengerEnabled), icon: <MessageSquare className="w-3 h-3" />, label: "Messenger" },
    { key: "sheets",   active: isChannelConnected("sheets", !!company.googleSheetsEnabled), icon: <Sheet className="w-3 h-3" />, label: "Sheets" },
    { key: "ai",       active: !!company.aiAgentApiKey,      icon: <Sparkles className="w-3 h-3" />, label: "AI Agent" },
  ];'''

new_channels_array = '''  const channels = [
    { key: "web",      active: isChannelConnected(company, "web", !!company.widgetEnabled),    icon: <Globe className="w-3 h-3" />,  label: "Website"  },
    { key: "telegram", active: isChannelConnected(company, "telegram", !!company.telegramEnabled),  icon: <Send className="w-3 h-3" />,   label: "Telegram" },
    { key: "whatsapp", active: isChannelConnected(company, "whatsapp", !!company.whatsappEnabled),  icon: <Phone className="w-3 h-3" />,   label: "WhatsApp" },
    { key: "messenger",active: isChannelConnected(company, "messenger", !!company.messengerEnabled), icon: <MessageSquare className="w-3 h-3" />, label: "Messenger" },
    { key: "sheets",   active: isChannelConnected(company, "sheets", !!company.googleSheetsEnabled), icon: <Sheet className="w-3 h-3" />, label: "Sheets" },
    { key: "ai",       active: !!company.aiAgentApiKey,      icon: <Sparkles className="w-3 h-3" />, label: "AI Agent" },
  ];'''

content = content.replace(old_channels_array, new_channels_array)

# 3. Update the modal view integratioins block
old_integrations = '''                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                    {[
                      { label: "Website",   active: !!viewCompany.widgetEnabled,    icon: <Globe className="w-4 h-4" />,          color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
                      { label: "Telegram",  active: !!viewCompany.telegramEnabled,  icon: <Send className="w-4 h-4" />,           color: "text-sky-400 bg-sky-500/10 border-sky-500/20" },
                      { label: "WhatsApp",  active: !!viewCompany.whatsappEnabled,  icon: <Phone className="w-4 h-4" />,          color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
                      { label: "Messenger", active: !!viewCompany.messengerEnabled, icon: <MessageSquare className="w-4 h-4" />, color: "text-blue-500 bg-blue-500/10 border-blue-500/20" },
                      { label: "Sheets",    active: !!viewCompany.googleSheetsEnabled, icon: <Sheet className="w-4 h-4" />,       color: "text-green-400 bg-green-500/10 border-green-500/20" },
                      { label: "AI Agent",  active: !!viewCompany.aiAgentApiKey,     icon: <Sparkles className="w-4 h-4" />,      color: "text-violet-400 bg-violet-500/10 border-violet-500/20" },
                    ].map((ch) => ('''

new_integrations = '''                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                    {[
                      { label: "Website",   active: isChannelConnected(viewCompany, "web", !!viewCompany.widgetEnabled),    icon: <Globe className="w-4 h-4" />,          color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
                      { label: "Telegram",  active: isChannelConnected(viewCompany, "telegram", !!viewCompany.telegramEnabled),  icon: <Send className="w-4 h-4" />,           color: "text-sky-400 bg-sky-500/10 border-sky-500/20" },
                      { label: "WhatsApp",  active: isChannelConnected(viewCompany, "whatsapp", !!viewCompany.whatsappEnabled),  icon: <Phone className="w-4 h-4" />,          color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
                      { label: "Messenger", active: isChannelConnected(viewCompany, "messenger", !!viewCompany.messengerEnabled), icon: <MessageSquare className="w-4 h-4" />, color: "text-blue-500 bg-blue-500/10 border-blue-500/20" },
                      { label: "Sheets",    active: isChannelConnected(viewCompany, "sheets", !!viewCompany.googleSheetsEnabled), icon: <Sheet className="w-4 h-4" />,       color: "text-green-400 bg-green-500/10 border-green-500/20" },
                      { label: "AI Agent",  active: !!viewCompany.aiAgentApiKey,     icon: <Sparkles className="w-4 h-4" />,      color: "text-violet-400 bg-violet-500/10 border-violet-500/20" },
                    ].map((ch) => ('''

content = content.replace(old_integrations, new_integrations)

with open('artifacts/chatbot-admin/src/pages/admin/AdminCompanies.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Replacement logic applied.")
