import { google, calendar_v3 } from "googleapis";
import { pino } from "pino";

const logger = pino({ name: "googleCalendar" });

export interface GoogleCalendarCredentials {
  client_email?: string;
  private_key?: string;
  project_id?: string;
  [key: string]: any;
}

export function parseServiceAccountKey(keyInput?: string | null): GoogleCalendarCredentials | null {
  if (!keyInput || !keyInput.trim()) return null;
  try {
    const parsed = JSON.parse(keyInput.trim());
    if (parsed.client_email && parsed.private_key) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function resolveGoogleCalendarCredentials(company: {
  googleCalendarServiceAccountKey?: string | null;
  serviceAccountKey?: string | null;
}): { credentials: GoogleCalendarCredentials | null; source: "custom" | "company" | "none" } {
  if (company.googleCalendarServiceAccountKey) {
    const creds = parseServiceAccountKey(company.googleCalendarServiceAccountKey);
    if (creds) return { credentials: creds, source: "custom" };
  }
  if (company.serviceAccountKey) {
    const creds = parseServiceAccountKey(company.serviceAccountKey);
    if (creds) return { credentials: creds, source: "company" };
  }
  return { credentials: null, source: "none" };
}

export function getCalendarClient(credentials: GoogleCalendarCredentials): calendar_v3.Calendar {
  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: [
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/calendar.events",
    ],
  });

  return google.calendar({ version: "v3", auth });
}

export async function testGoogleCalendarConnection(
  credentials: GoogleCalendarCredentials,
  calendarId: string = "primary"
): Promise<{ ok: boolean; calendarSummary: string; timeZone: string; message: string }> {
  try {
    const calendar = getCalendarClient(credentials);
    const targetCalendarId = calendarId.trim() || "primary";

    // Attempt to fetch calendar metadata or events
    const meta = await calendar.calendars.get({ calendarId: targetCalendarId });
    return {
      ok: true,
      calendarSummary: meta.data.summary || targetCalendarId,
      timeZone: meta.data.timeZone || "UTC",
      message: `Successfully connected to calendar "${meta.data.summary || targetCalendarId}"`,
    };
  } catch (err: any) {
    logger.warn({ err: err?.message }, "Google Calendar test connection failed");
    // If calendars.get failed due to permissions on 'primary', fallback to events.list
    try {
      const calendar = getCalendarClient(credentials);
      const targetCalendarId = calendarId.trim() || "primary";
      const eventsRes = await calendar.events.list({
        calendarId: targetCalendarId,
        maxResults: 1,
        timeMin: new Date().toISOString(),
      });
      return {
        ok: true,
        calendarSummary: eventsRes.data.summary || targetCalendarId,
        timeZone: eventsRes.data.timeZone || "UTC",
        message: `Successfully connected to calendar "${eventsRes.data.summary || targetCalendarId}"`,
      };
    } catch (innerErr: any) {
      const errMsg = innerErr?.message || err?.message || "Unknown error";
      throw new Error(`Google Calendar connection failed: ${errMsg}`);
    }
  }
}

export interface CalendarEventItem {
  id: string;
  summary: string;
  description: string;
  start: string;
  end: string;
  htmlLink?: string;
  meetLink?: string;
  status?: string;
  attendees?: Array<{ email?: string; name?: string; responseStatus?: string }>;
}

export async function listUpcomingCalendarEvents(
  credentials: GoogleCalendarCredentials,
  calendarId: string = "primary",
  maxResults: number = 20
): Promise<CalendarEventItem[]> {
  const calendar = getCalendarClient(credentials);
  const targetCalendarId = calendarId.trim() || "primary";

  const res = await calendar.events.list({
    calendarId: targetCalendarId,
    timeMin: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // Include today
    maxResults,
    singleEvents: true,
    orderBy: "startTime",
  });

  const items = res.data.items || [];
  return items.map((item) => {
    let meetLink: string | undefined = undefined;
    if (item.conferenceData?.entryPoints) {
      const videoEntry = item.conferenceData.entryPoints.find(
        (ep) => ep.entryPointType === "video"
      );
      if (videoEntry?.uri) meetLink = videoEntry.uri;
    }
    if (!meetLink && item.hangoutLink) {
      meetLink = item.hangoutLink;
    }

    return {
      id: item.id || `evt-${Date.now()}`,
      summary: item.summary || "Untitled Event",
      description: item.description || "",
      start: item.start?.dateTime || item.start?.date || "",
      end: item.end?.dateTime || item.end?.date || "",
      htmlLink: item.htmlLink || undefined,
      meetLink,
      status: item.status || "confirmed",
      attendees: (item.attendees || []).map((a) => ({
        email: a.email || undefined,
        name: a.displayName || undefined,
        responseStatus: a.responseStatus || undefined,
      })),
    };
  });
}

export async function createCalendarEvent(
  credentials: GoogleCalendarCredentials,
  calendarId: string = "primary",
  eventData: {
    summary: string;
    description?: string;
    startTime: string;
    endTime?: string;
    durationMinutes?: number;
    timeZone?: string;
    attendeeEmail?: string;
    attendeeName?: string;
  }
): Promise<CalendarEventItem> {
  const calendar = getCalendarClient(credentials);
  const targetCalendarId = calendarId.trim() || "primary";

  const startDate = new Date(eventData.startTime);
  if (isNaN(startDate.getTime())) {
    throw new Error("Invalid start time format");
  }

  let endDate: Date;
  if (eventData.endTime) {
    endDate = new Date(eventData.endTime);
    if (isNaN(endDate.getTime())) {
      const duration = eventData.durationMinutes || 30;
      endDate = new Date(startDate.getTime() + duration * 60 * 1000);
    }
  } else {
    const duration = eventData.durationMinutes || 30;
    endDate = new Date(startDate.getTime() + duration * 60 * 1000);
  }

  const tz = eventData.timeZone || "UTC";
  const attendees = eventData.attendeeEmail
    ? [{ email: eventData.attendeeEmail, displayName: eventData.attendeeName }]
    : undefined;

  const insertRes = await calendar.events.insert({
    calendarId: targetCalendarId,
    conferenceDataVersion: 1,
    requestBody: {
      summary: eventData.summary.trim(),
      description: eventData.description?.trim() || undefined,
      start: { dateTime: startDate.toISOString(), timeZone: tz },
      end: { dateTime: endDate.toISOString(), timeZone: tz },
      attendees,
      conferenceData: {
        createRequest: {
          requestId: `meet-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
    },
  });

  const item = insertRes.data;
  let meetLink: string | undefined = undefined;
  if (item.conferenceData?.entryPoints) {
    const videoEntry = item.conferenceData.entryPoints.find(
      (ep) => ep.entryPointType === "video"
    );
    if (videoEntry?.uri) meetLink = videoEntry.uri;
  }
  if (!meetLink && item.hangoutLink) {
    meetLink = item.hangoutLink;
  }

  return {
    id: item.id || `evt-${Date.now()}`,
    summary: item.summary || eventData.summary,
    description: item.description || eventData.description || "",
    start: item.start?.dateTime || startDate.toISOString(),
    end: item.end?.dateTime || endDate.toISOString(),
    htmlLink: item.htmlLink || undefined,
    meetLink,
    status: item.status || "confirmed",
  };
}

export function getCalendarPromptSection(company: any): string {
  if (!company?.googleCalendarEnabled) return "";
  return `\n\n[GOOGLE CALENDAR APPOINTMENT SCHEDULING]:
This business has Google Calendar active for scheduling appointments and consultations.
Timezone: ${company.googleCalendarTimezone || "UTC"}
Standard Meeting Duration: ${company.googleCalendarDuration || 30} minutes
${company.googleCalendarBookingRules ? `Booking Guidelines: ${company.googleCalendarBookingRules}` : ""}
When a user asks to book an appointment or schedule a meeting, politely collect their name, email address, and preferred date/time.`;
}

