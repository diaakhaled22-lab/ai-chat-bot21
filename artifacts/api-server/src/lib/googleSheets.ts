import { google, sheets_v4 } from "googleapis";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "./logger";
import type { companiesTable } from "@workspace/db";

type ChatMessage = { role: "user" | "assistant"; content: string };

function extractSpreadsheetId(link: string): string | null {
  const match = link.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match) return match[1];
  if (/^[a-zA-Z0-9-_]{20,}$/.test(link.trim())) return link.trim();
  return null;
}

function columnLetter(index: number): string {
  let n = index + 1;
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

type SheetHandle = {
  sheets: sheets_v4.Sheets;
  spreadsheetId: string;
  tabTitle: string;
  headers: string[];
};

/**
 * Resolves the configured Google Sheet + tab for a company and returns a
 * ready-to-use client plus its header row (column names, e.g. "Name",
 * "Phone"). Returns null when Sheets isn't configured or unreachable;
 * never throws so callers (chat handlers) are never blocked.
 */
async function getSheetHandle(
  company: typeof companiesTable.$inferSelect,
): Promise<SheetHandle | null> {
  if (!company.googleSheetsEnabled) return null;
  if (!company.googleSheetsLink || !company.serviceAccountKey) return null;

  const spreadsheetId = extractSpreadsheetId(company.googleSheetsLink);
  if (!spreadsheetId) return null;

  let credentials: { client_email?: string; private_key?: string };
  try {
    credentials = JSON.parse(company.serviceAccountKey);
  } catch {
    logger.warn({ companyId: company.id }, "Google Sheets: saved service account JSON is invalid");
    return null;
  }
  if (!credentials.client_email || !credentials.private_key) return null;

  try {
    const auth = new google.auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      // Read+write: the sheet is a write target where the bot records
      // captured customer details (name, phone, etc.), not just a
      // read-only knowledge source.
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const sheets = google.sheets({ version: "v4", auth });

    const meta = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: "sheets.properties.title",
    });

    const tabTitles = (meta.data.sheets ?? [])
      .map((s) => s.properties?.title)
      .filter((t): t is string => !!t);

    const requestedPage = company.googleSheetsPage?.trim();
    let tabTitle = tabTitles[0];
    if (requestedPage) {
      const matched = tabTitles.find((t) => t.toLowerCase() === requestedPage.toLowerCase());
      if (matched) {
        tabTitle = matched;
      } else {
        logger.warn(
          { companyId: company.id, requestedPage, availableTabs: tabTitles },
          "Google Sheets: configured page not found, falling back to first tab",
        );
      }
    }
    if (!tabTitle) return null;

    const headerRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${tabTitle}!1:1`,
    });
    const headers = (headerRes.data.values?.[0] ?? []).map((h) => String(h ?? "").trim());
    if (!headers.length || headers.every((h) => !h)) {
      logger.warn({ companyId: company.id, tabTitle }, "Google Sheets: sheet has no header row, cannot map fields");
      return null;
    }

    return { sheets, spreadsheetId, tabTitle, headers };
  } catch (err) {
    logger.warn({ err, companyId: company.id }, "Failed to connect to Google Sheet");
    return null;
  }
}

/** Minimal single-shot JSON-extraction completion, reusing the company's own AI provider/key. */
async function extractFieldsWithAI(
  company: typeof companiesTable.$inferSelect,
  headers: string[],
  conversationText: string,
): Promise<Record<string, string> | null> {
  if (!company.aiAgentApiKey) return null;

  const provider = company.aiProvider ?? "openai";
  const model = company.aiModel ?? (
    provider === "anthropic" ? "claude-3-5-haiku-20241022" :
    provider === "google" ? "gemini-2.0-flash" :
    provider === "openrouter" ? "google/gemma-4-31b-it:free" : "gpt-4o-mini"
  );

  const instructions =
    `You extract structured data from a customer support conversation.\n` +
    `Return ONLY a compact JSON object with exactly these keys: ${JSON.stringify(headers)}.\n` +
    `Fill a key's value with information explicitly stated by the customer in the conversation ` +
    `(e.g. their name, phone number, email). If a field was not mentioned, use an empty string "" ` +
    `for it. Never invent or guess values. Do not include any text besides the JSON object.\n\n` +
    `Conversation:\n${conversationText.slice(0, 6000)}`;

  let raw = "";
  try {
    if (provider === "anthropic") {
      const client = new Anthropic({ apiKey: company.aiAgentApiKey });
      const resp = await client.messages.create({
        model, max_tokens: 512,
        messages: [{ role: "user", content: instructions }],
      });
      raw = (resp.content[0] as { type: string; text: string })?.text ?? "";
    } else if (provider === "google") {
      const genAI = new GoogleGenerativeAI(company.aiAgentApiKey);
      const genModel = genAI.getGenerativeModel({ model });
      const result = await genModel.generateContent(instructions);
      raw = result.response.text();
    } else if (provider === "openrouter") {
      const openrouter = new OpenAI({ apiKey: company.aiAgentApiKey, baseURL: "https://openrouter.ai/api/v1" });
      const completion = await openrouter.chat.completions.create({
        model, messages: [{ role: "user", content: instructions }],
      });
      raw = completion.choices[0]?.message?.content ?? "";
    } else {
      const openai = new OpenAI({ apiKey: company.aiAgentApiKey });
      const completion = await openai.chat.completions.create({
        model, messages: [{ role: "user", content: instructions }],
        response_format: { type: "json_object" },
      });
      raw = completion.choices[0]?.message?.content ?? "";
    }
  } catch (err) {
    logger.warn({ err, companyId: company.id }, "Google Sheets: field extraction AI call failed");
    return null;
  }

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    const result: Record<string, string> = {};
    for (const header of headers) {
      const value = parsed[header];
      result[header] = typeof value === "string" ? value.trim() : "";
    }
    return result;
  } catch {
    logger.warn({ companyId: company.id, raw }, "Google Sheets: extraction returned invalid JSON");
    return null;
  }
}

function findIdentifierHeaderIndices(headers: string[]): { phoneIdx: number; emailIdx: number } {
  return {
    phoneIdx: headers.findIndex((h) => /phone/i.test(h)),
    emailIdx: headers.findIndex((h) => /e-?mail/i.test(h)),
  };
}

/**
 * Extracts customer-provided details (name, phone, email, etc.) from a
 * conversation and writes/updates a row in the company's configured
 * Google Sheet, using the sheet's own header row as the field schema.
 * The sheet is a write target controlled by the company owner (they
 * define the columns); this never blocks or fails the chat reply.
 */
export async function syncConversationToSheet(
  company: typeof companiesTable.$inferSelect,
  conversation: ChatMessage[],
): Promise<void> {
  try {
    const handle = await getSheetHandle(company);
    if (!handle) return;
    const { sheets, spreadsheetId, tabTitle, headers } = handle;

    const conversationText = conversation
      .map((m) => `${m.role === "user" ? "Customer" : "Bot"}: ${m.content}`)
      .join("\n");

    const extracted = await extractFieldsWithAI(company, headers, conversationText);
    if (!extracted) return;

    const dateIdx = headers.findIndex((h) => /date/i.test(h));
    if (dateIdx !== -1 && !extracted[headers[dateIdx]]) {
      extracted[headers[dateIdx]] = new Date().toISOString().slice(0, 10);
    }

    const hasAnyValue = headers.some((h, i) => i !== dateIdx && extracted[h]);
    if (!hasAnyValue) return;

    const { phoneIdx, emailIdx } = findIdentifierHeaderIndices(headers);
    const extractedPhone = phoneIdx !== -1 ? extracted[headers[phoneIdx]].trim().toLowerCase() : "";
    const extractedEmail = emailIdx !== -1 ? extracted[headers[emailIdx]].trim().toLowerCase() : "";

    let existingRowNumber: number | null = null;
    let existingRowValues: string[] = [];

    if (extractedPhone || extractedEmail) {
      const lastCol = columnLetter(headers.length - 1);
      const dataRes = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${tabTitle}!A2:${lastCol}`,
      });
      const rows = dataRes.data.values ?? [];
      const matchIdx = rows.findIndex((row) => {
        const rowPhone = phoneIdx !== -1 ? (row[phoneIdx] ?? "").toString().trim().toLowerCase() : "";
        const rowEmail = emailIdx !== -1 ? (row[emailIdx] ?? "").toString().trim().toLowerCase() : "";
        return (extractedPhone && rowPhone === extractedPhone) || (extractedEmail && rowEmail === extractedEmail);
      });
      if (matchIdx !== -1) {
        existingRowNumber = matchIdx + 2; // +1 for header row, +1 for 1-based
        existingRowValues = rows[matchIdx].map((v) => String(v ?? ""));
      }
    }

    const mergedRow = headers.map((h, i) => extracted[h] || existingRowValues[i] || "");

    if (existingRowNumber) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${tabTitle}!A${existingRowNumber}:${columnLetter(headers.length - 1)}${existingRowNumber}`,
        valueInputOption: "RAW",
        requestBody: { values: [mergedRow] },
      });
      logger.info({ companyId: company.id, row: existingRowNumber }, "Google Sheets: updated existing customer row");
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${tabTitle}!A:A`,
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: [mergedRow] },
      });
      logger.info({ companyId: company.id }, "Google Sheets: appended new customer row");
    }
  } catch (err) {
    logger.warn({ err, companyId: company.id }, "Google Sheets: failed to sync conversation data");
  }
}
