import { db, companyKnowledgeFilesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";
import { ObjectStorageService } from "./objectStorage";

const objectStorageService = new ObjectStorageService();

// Cap how much text we keep per file in the DB (parsed content can be huge for large sheets/PDFs).
const MAX_STORED_CHARS_PER_FILE = 20_000;
// Cap how much of each file's text we inject into a single AI prompt.
const MAX_PROMPT_CHARS_PER_FILE = 2_500;
// Cap the combined size of the whole "Uploaded Files Knowledge Base" section.
const MAX_PROMPT_CHARS_TOTAL = 9_000;

export type KnowledgeFileType = "pdf" | "excel" | "csv" | "json" | "google_sheet";

function extractGoogleSheetId(link: string): string | null {
  const match = link.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match) return match[1];
  if (/^[a-zA-Z0-9-_]{20,}$/.test(link.trim())) return link.trim();
  return null;
}

function humanizeKey(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

/**
 * Converts arbitrary parsed JSON into plain, indented "label: value" text —
 * no braces, brackets, or quoted keys — so it reads like normal notes rather
 * than a data file, and models are less tempted to parrot raw JSON back to users.
 */
function jsonToReadableText(value: unknown, indent = 0): string {
  const pad = "  ".repeat(indent);

  if (value === null || value === undefined) return "(none)";

  if (Array.isArray(value)) {
    if (value.length === 0) return "(empty list)";
    return value
      .map((item, i) => {
        if (item !== null && typeof item === "object") {
          return `${pad}${i + 1}.\n${jsonToReadableText(item, indent + 1)}`;
        }
        return `${pad}${i + 1}. ${jsonToReadableText(item, indent)}`;
      })
      .join("\n");
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return "(empty)";
    return entries
      .map(([k, v]) => {
        const label = humanizeKey(k);
        if (v !== null && typeof v === "object") {
          return `${pad}${label}:\n${jsonToReadableText(v, indent + 1)}`;
        }
        return `${pad}${label}: ${jsonToReadableText(v, indent)}`;
      })
      .join("\n");
  }

  return String(value);
}

export async function extractTextFromBuffer(fileType: KnowledgeFileType, buffer: Buffer, fileName: string): Promise<string> {
  if (fileType === "pdf") {
    // pdf-parse@1.x is CJS; the module itself is the function
    const pdfParseModule = await import("pdf-parse");
    const pdfParse = (pdfParseModule as any).default ?? pdfParseModule;
    const data = await pdfParse(buffer);
    return data.text;
  }

  if (fileType === "excel") {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const parts: string[] = [];
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      if (csv.trim()) {
        parts.push(`Sheet "${sheetName}":\n${csv.trim()}`);
      }
    }
    return parts.join("\n\n");
  }

  if (fileType === "csv") {
    return buffer.toString("utf-8");
  }

  if (fileType === "json") {
    const raw = buffer.toString("utf-8");
    try {
      const parsed = JSON.parse(raw);
      // Render as plain "label: value" text instead of raw JSON syntax, so the AI
      // works with readable data and isn't tempted to echo braces/brackets/quotes
      // back to the customer.
      return jsonToReadableText(parsed);
    } catch {
      throw new Error(`"${fileName}" is not valid JSON`);
    }
  }

  throw new Error(`Unsupported file type: ${fileType}`);
}

async function extractTextFromGoogleSheetLink(link: string): Promise<string> {
  const sheetId = extractGoogleSheetId(link);
  if (!sheetId) {
    throw new Error("That doesn't look like a valid Google Sheet link.");
  }
  const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
  const res = await fetch(exportUrl, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) {
    throw new Error(
      "Could not read this Google Sheet. Make sure sharing is set to \"Anyone with the link — Viewer\"."
    );
  }
  return await res.text();
}

/**
 * Parses an uploaded/linked knowledge file and stores the extracted text on the row.
 * Runs after the DB row is created (status starts as "processing").
 */
export async function processKnowledgeFile(fileId: number): Promise<void> {
  const [file] = await db
    .select()
    .from(companyKnowledgeFilesTable)
    .where(eq(companyKnowledgeFilesTable.id, fileId))
    .limit(1);

  if (!file) return;

  try {
    let text: string;

    if (file.fileType === "google_sheet") {
      if (!file.sourceUrl) throw new Error("Missing Google Sheet link");
      text = await extractTextFromGoogleSheetLink(file.sourceUrl);
    } else {
      if (!file.objectPath) throw new Error("Missing uploaded file");
      const objectFile = await objectStorageService.getObjectEntityFile(file.objectPath);
      const [buffer] = await objectFile.download();
      text = await extractTextFromBuffer(file.fileType as KnowledgeFileType, buffer, file.fileName);
    }

    const trimmed = text.trim();
    if (!trimmed) {
      throw new Error("No readable text/data was found in this file.");
    }

    await db
      .update(companyKnowledgeFilesTable)
      .set({
        status: "ready",
        extractedText: trimmed.slice(0, MAX_STORED_CHARS_PER_FILE),
        errorMessage: null,
      })
      .where(eq(companyKnowledgeFilesTable.id, fileId));
  } catch (err) {
    logger.error({ err, fileId }, "Failed to process knowledge file");
    await db
      .update(companyKnowledgeFilesTable)
      .set({
        status: "error",
        errorMessage: err instanceof Error ? err.message : "Failed to process file",
      })
      .where(eq(companyKnowledgeFilesTable.id, fileId));
  }
}

/**
 * Builds the "Uploaded Files Knowledge Base" system prompt section from all
 * successfully-parsed knowledge files belonging to a company.
 */
export async function getKnowledgeFilesPromptSection(companyId: number): Promise<string> {
  const files = await db
    .select()
    .from(companyKnowledgeFilesTable)
    .where(and(eq(companyKnowledgeFilesTable.companyId, companyId), eq(companyKnowledgeFilesTable.status, "ready")));

  if (files.length === 0) return "";

  let combined = "";
  for (const file of files) {
    if (!file.extractedText) continue;
    const chunk = `--- ${file.fileName} ---\n${file.extractedText.slice(0, MAX_PROMPT_CHARS_PER_FILE)}`;
    if (combined.length + chunk.length > MAX_PROMPT_CHARS_TOTAL) {
      const remaining = MAX_PROMPT_CHARS_TOTAL - combined.length;
      if (remaining > 100) combined += `\n\n${chunk.slice(0, remaining)}`;
      break;
    }
    combined += (combined ? "\n\n" : "") + chunk;
  }

  return combined ? `\n\nUploaded Files Knowledge Base:\n${combined}` : "";
}
