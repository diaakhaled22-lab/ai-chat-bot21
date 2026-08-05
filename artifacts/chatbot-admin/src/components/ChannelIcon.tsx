import { useId } from "react";

export type Channel = "telegram" | "whatsapp" | "messenger" | "widget";

interface ChannelIconProps {
  channel: Channel;
  size?: number;
  className?: string;
}

function TelegramIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Telegram">
      <circle cx="12" cy="12" r="12" fill="#229ED9" />
      <path
        d="M5.35 11.63l12.23-4.71c.57-.21 1.06.14.88.98l-2.08 9.81c-.16.7-.57.87-1.15.54l-3.17-2.34-1.53 1.47c-.17.17-.31.31-.64.31l.23-3.22 5.84-5.27c.25-.23-.06-.35-.39-.12L7.42 14.08l-3.13-.98c-.68-.21-.69-.68.16-.98z"
        fill="white"
      />
    </svg>
  );
}

function WhatsAppIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="WhatsApp">
      <circle cx="12" cy="12" r="12" fill="#25D366" />
      <path
        d="M17.47 6.5A7.44 7.44 0 0 0 12 4.25a7.5 7.5 0 0 0-6.51 11.2l-1.04 3.8 3.9-1.02A7.5 7.5 0 0 0 12 19.75a7.5 7.5 0 0 0 7.5-7.5 7.44 7.44 0 0 0-2.03-5.75zM12 18.25a6.22 6.22 0 0 1-3.16-.87l-.23-.14-2.32.61.62-2.27-.15-.23A6.25 6.25 0 1 1 12 18.25zm3.43-4.67c-.19-.09-1.1-.54-1.27-.6-.17-.06-.3-.09-.42.09-.12.19-.47.6-.58.72-.1.13-.21.14-.4.05-.18-.09-.77-.28-1.46-.9-.54-.48-.9-1.07-1.01-1.25-.1-.19-.01-.29.08-.38.08-.08.19-.21.28-.31.1-.1.13-.18.19-.3.07-.12.03-.23-.01-.32-.05-.09-.42-1.02-.58-1.39-.15-.36-.3-.31-.42-.32h-.36c-.12 0-.32.05-.49.23-.17.19-.64.62-.64 1.52s.66 1.76.75 1.89c.1.12 1.3 1.98 3.14 2.78.44.19.78.3 1.05.38.44.14.84.12 1.16.07.35-.05 1.1-.45 1.25-.89.16-.43.16-.8.11-.88-.04-.08-.17-.12-.36-.21z"
        fill="white"
      />
    </svg>
  );
}

function MessengerIcon({ size }: { size: number }) {
  const uid = useId();
  const gradId = `msg-g-${uid}`.replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-label="Messenger">
      <defs>
        <linearGradient id={gradId} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#0099FF" />
          <stop offset="100%" stopColor="#A033FF" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="12" fill={`url(#${gradId})`} />
      <path
        d="M12 4C7.58 4 4 7.37 4 11.52c0 2.3 1.14 4.36 2.93 5.73V19.5l2.67-1.47c.71.2 1.46.3 2.4.3 4.42 0 8-3.37 8-7.52S16.42 4 12 4zm.79 10.13-2.04-2.17-3.97 2.17 4.37-4.64 2.08 2.17 3.93-2.17-4.37 4.64z"
        fill="white"
      />
    </svg>
  );
}

function WidgetIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Website Chat Widget">
      <circle cx="12" cy="12" r="12" fill="#7C3AED" />
      <path
        d="M7 8.5A1.5 1.5 0 0 1 8.5 7h7A1.5 1.5 0 0 1 17 8.5v5a1.5 1.5 0 0 1-1.5 1.5H13l-3 2.5V15H8.5A1.5 1.5 0 0 1 7 13.5v-5z"
        fill="white"
      />
    </svg>
  );
}

export function ChannelIcon({ channel, size = 24, className }: ChannelIconProps) {
  const icon = (() => {
    switch (channel) {
      case "telegram":  return <TelegramIcon  size={size} />;
      case "whatsapp":  return <WhatsAppIcon  size={size} />;
      case "messenger": return <MessengerIcon size={size} />;
      case "widget":    return <WidgetIcon    size={size} />;
    }
  })();

  return (
    <span className={`inline-flex shrink-0 ${className ?? ""}`}>
      {icon}
    </span>
  );
}

/**
 * Compact inline-SVG strings for use in the embed snippet HTML.
 * These must be self-contained (no React, no external refs).
 */
export const CHANNEL_SVG_SNIPPETS: Record<Channel, string> = {
  telegram: `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill="#229ED9"/><path d="M5.35 11.63l12.23-4.71c.57-.21 1.06.14.88.98l-2.08 9.81c-.16.7-.57.87-1.15.54l-3.17-2.34-1.53 1.47c-.17.17-.31.31-.64.31l.23-3.22 5.84-5.27c.25-.23-.06-.35-.39-.12L7.42 14.08l-3.13-.98c-.68-.21-.69-.68.16-.98z" fill="#fff"/></svg>`,
  whatsapp:  `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill="#25D366"/><path d="M17.47 6.5A7.44 7.44 0 0 0 12 4.25a7.5 7.5 0 0 0-6.51 11.2l-1.04 3.8 3.9-1.02A7.5 7.5 0 0 0 12 19.75a7.5 7.5 0 0 0 7.5-7.5 7.44 7.44 0 0 0-2.03-5.75zM12 18.25a6.22 6.22 0 0 1-3.16-.87l-.23-.14-2.32.61.62-2.27-.15-.23A6.25 6.25 0 1 1 12 18.25zm3.43-4.67c-.19-.09-1.1-.54-1.27-.6-.17-.06-.3-.09-.42.09-.12.19-.47.6-.58.72-.1.13-.21.14-.4.05-.18-.09-.77-.28-1.46-.9-.54-.48-.9-1.07-1.01-1.25-.1-.19-.01-.29.08-.38.08-.08.19-.21.28-.31.1-.1.13-.18.19-.3.07-.12.03-.23-.01-.32-.05-.09-.42-1.02-.58-1.39-.15-.36-.3-.31-.42-.32h-.36c-.12 0-.32.05-.49.23-.17.19-.64.62-.64 1.52s.66 1.76.75 1.89c.1.12 1.3 1.98 3.14 2.78.44.19.78.3 1.05.38.44.14.84.12 1.16.07.35-.05 1.1-.45 1.25-.89.16-.43.16-.8.11-.88-.04-.08-.17-.12-.36-.21z" fill="#fff"/></svg>`,
  messenger: `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24"><defs><linearGradient id="m" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" stop-color="#0099FF"/><stop offset="100%" stop-color="#A033FF"/></linearGradient></defs><circle cx="12" cy="12" r="12" fill="url(#m)"/><path d="M12 4C7.58 4 4 7.37 4 11.52c0 2.3 1.14 4.36 2.93 5.73V19.5l2.67-1.47c.71.2 1.46.3 2.4.3 4.42 0 8-3.37 8-7.52S16.42 4 12 4zm.79 10.13-2.04-2.17-3.97 2.17 4.37-4.64 2.08 2.17 3.93-2.17-4.37 4.64z" fill="#fff"/></svg>`,
  widget:    `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill="#7C3AED"/><path d="M7 8.5A1.5 1.5 0 0 1 8.5 7h7A1.5 1.5 0 0 1 17 8.5v5a1.5 1.5 0 0 1-1.5 1.5H13l-3 2.5V15H8.5A1.5 1.5 0 0 1 7 13.5v-5z" fill="#fff"/></svg>`,
};
