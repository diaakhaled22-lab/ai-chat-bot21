export function isWidgetOriginAllowed(origin: string | undefined, widgetAllowedDomains: string | null): boolean {
  const allowedDomains = (widgetAllowedDomains || "")
    .split(",")
    .map((domain) => domain.trim().toLowerCase().replace(/\.+$/, ""))
    .filter(Boolean);

  if (allowedDomains.length === 0) return true;
  if (!origin) return false;

  try {
    const url = new URL(origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const originHost = url.hostname.toLowerCase().replace(/\.+$/, "");
    return allowedDomains.some((domain) => originHost === domain || originHost.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}
