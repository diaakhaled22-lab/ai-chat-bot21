import OpenAI, { toFile } from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getSupportAiSettings } from "./supportAi";
import { db, companiesTable } from "@workspace/db";
import { type InferSelectModel, sql } from "drizzle-orm";
import { logger } from "./logger";

export async function ensureVoiceSchema(): Promise<void> {
  try {
    await db.execute(sql`
      ALTER TABLE companies
      ADD COLUMN IF NOT EXISTS voice_reply_enabled boolean NOT NULL DEFAULT false;
    `);
    await db.execute(sql`
      ALTER TABLE companies
      ADD COLUMN IF NOT EXISTS voice_reply_voice text DEFAULT 'alloy';
    `);
    logger.info("Voice schema verified successfully");
  } catch (err) {
    logger.warn({ err }, "ensureVoiceSchema notice");
  }
}

export async function downloadTelegramAudio(telegramToken: string, fileId: string): Promise<Buffer> {
  const getFileRes = await fetch(`https://api.telegram.org/bot${telegramToken}/getFile?file_id=${fileId}`);
  const getFileData = (await getFileRes.json()) as { result?: { file_path?: string } };
  if (!getFileData.result?.file_path) {
    throw new Error("Telegram did not return an audio file path.");
  }
  const filePath = getFileData.result.file_path;
  const fileUrl = `https://api.telegram.org/file/bot${telegramToken}/${filePath}`;

  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error(`Failed to download audio from Telegram (${response.status})`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function downloadWhatsAppAudio(whatsappToken: string, mediaId: string): Promise<Buffer> {
  // Graph API v21.0
  const getUrlRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${whatsappToken}` },
  });
  const getUrlData = (await getUrlRes.json()) as { url?: string };
  if (!getUrlData.url) {
    throw new Error("WhatsApp did not return an audio media URL.");
  }
  const mediaUrl = getUrlData.url;

  const response = await fetch(mediaUrl, {
    headers: { Authorization: `Bearer ${whatsappToken}` },
  });
  if (!response.ok) {
    throw new Error(`Failed to download audio from WhatsApp (${response.status})`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Resolves an OpenAI API key from company credentials, system support AI, or environment.
 */
async function resolveOpenAiKey(company?: InferSelectModel<typeof companiesTable>): Promise<string | null> {
  if (company?.aiProvider === "openai" && company.aiAgentApiKey) {
    return company.aiAgentApiKey;
  }
  if (process.env.OPENAI_API_KEY) {
    return process.env.OPENAI_API_KEY;
  }
  const supportAi = await getSupportAiSettings();
  if (supportAi && supportAi.provider === "openai" && supportAi.apiKey) {
    return supportAi.apiKey;
  }
  return null;
}

/**
 * Resolves a Google Gemini API key from company credentials, system support AI, or environment.
 */
async function resolveGoogleKey(company?: InferSelectModel<typeof companiesTable>): Promise<string | null> {
  if (company?.aiProvider === "google" && company.aiAgentApiKey) {
    return company.aiAgentApiKey;
  }
  if (process.env.GEMINI_API_KEY) {
    return process.env.GEMINI_API_KEY;
  }
  if (process.env.GOOGLE_API_KEY) {
    return process.env.GOOGLE_API_KEY;
  }
  const supportAi = await getSupportAiSettings();
  if (supportAi && supportAi.provider === "google" && supportAi.apiKey) {
    return supportAi.apiKey;
  }
  return null;
}

/**
 * Transcribes audio buffer to text using OpenAI Whisper API.
 * If OpenAI is unavailable or fails, gracefully falls back to Gemini Audio Transcription.
 */
export async function transcribeAudio(
  company: InferSelectModel<typeof companiesTable>,
  buffer: Buffer,
  filename = "voice.ogg",
  mimeType = "audio/ogg",
): Promise<string> {
  const openAiKey = await resolveOpenAiKey(company);

  if (openAiKey) {
    try {
      const openai = new OpenAI({ apiKey: openAiKey });
      const file = await toFile(buffer, filename, { type: mimeType });

      const transcription = await openai.audio.transcriptions.create({
        file,
        model: "whisper-1",
      });

      if (transcription.text && transcription.text.trim().length > 0) {
        logger.info({ companyId: company.id, chars: transcription.text.length }, "Transcribed voice note via Whisper API");
        return transcription.text.trim();
      }
    } catch (whisperErr) {
      logger.warn({ whisperErr, companyId: company.id }, "Whisper transcription failed, checking Gemini fallback");
    }
  }

  // Fallback: Gemini native audio transcription
  const googleKey = await resolveGoogleKey(company);
  if (googleKey) {
    try {
      const genAI = new GoogleGenerativeAI(googleKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const result = await model.generateContent([
        {
          inlineData: {
            data: buffer.toString("base64"),
            mimeType,
          },
        },
        "You are an accurate voice note transcriber. Transcribe this audio recording word-for-word in its original language (e.g. Arabic / Egyptian dialect / English). Do NOT add explanations, notes, or prefixes. Output ONLY the verbatim text transcription.",
      ]);
      const text = result.response.text().trim();
      if (text.length > 0) {
        logger.info({ companyId: company.id, chars: text.length }, "Transcribed voice note via Gemini Audio Fallback");
        return text;
      }
    } catch (geminiErr) {
      logger.error({ geminiErr, companyId: company.id }, "Gemini audio transcription fallback failed");
    }
  }

  throw new Error("Could not transcribe audio: No available AI audio transcription provider (Whisper / Gemini)");
}

/**
 * Strips markdown and special symbols to make text read naturally by TTS.
 */
function cleanTextForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, "") // remove code blocks
    .replace(/`([^`]+)`/g, "$1") // inline code
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1") // markdown links -> title
    .replace(/https?:\/\/\S+/g, "") // remove raw URLs
    .replace(/[*_~#]/g, "") // bold / italic / headers
    .replace(/[•\-\+]\s+/g, "") // list bullets
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Generates speech audio (Opus / Ogg) from text using OpenAI TTS (tts-1).
 */
export async function generateVoiceResponse(
  company: InferSelectModel<typeof companiesTable>,
  text: string,
): Promise<Buffer | null> {
  const openAiKey = await resolveOpenAiKey(company);
  if (!openAiKey) {
    logger.debug({ companyId: company.id }, "Skipping voice response: no OpenAI key available for TTS");
    return null;
  }

  const clean = cleanTextForSpeech(text);
  if (!clean) return null;

  try {
    const openai = new OpenAI({ apiKey: openAiKey });
    const voice = (company.voiceReplyVoice as any) || "alloy";

    const speech = await openai.audio.speech.create({
      model: "tts-1",
      voice,
      input: clean.slice(0, 4000),
      response_format: "opus", // OGG/Opus compatible with WhatsApp and Telegram voice notes
    });

    const arrayBuf = await speech.arrayBuffer();
    return Buffer.from(arrayBuf);
  } catch (err) {
    logger.error({ err, companyId: company.id }, "Failed to generate TTS voice response");
    return null;
  }
}

/**
 * Sends a voice note (.ogg / opus) to a Telegram chat.
 */
export async function sendTelegramVoiceNote(
  botToken: string,
  chatId: number | string,
  audioBuffer: Buffer,
  caption?: string,
): Promise<boolean> {
  try {
    const formData = new FormData();
    formData.append("chat_id", String(chatId));

    const blob = new Blob([audioBuffer], { type: "audio/ogg" });
    formData.append("voice", blob, "voice.ogg");
    if (caption) {
      formData.append("caption", caption.slice(0, 1024));
    }

    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendVoice`, {
      method: "POST",
      body: formData,
    });
    const data = (await res.json()) as { ok: boolean; description?: string };
    if (!data.ok) {
      logger.warn({ data, chatId }, "Telegram sendVoice returned non-ok");
    }
    return data.ok;
  } catch (err) {
    logger.error({ err, chatId }, "Failed to send voice note to Telegram");
    return false;
  }
}

/**
 * Sends a voice note to a WhatsApp recipient using the Cloud API Media Upload and Audio Message.
 */
export async function sendWhatsAppVoiceNote(
  phoneNumberId: string,
  whatsappToken: string,
  toPhone: string,
  audioBuffer: Buffer,
): Promise<boolean> {
  try {
    // Step 1: Upload audio media to WhatsApp Cloud API
    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: "audio/ogg; codecs=opus" });
    formData.append("file", blob, "voice.ogg");
    formData.append("type", "audio/ogg");
    formData.append("messaging_product", "whatsapp");

    const uploadRes = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${whatsappToken}` },
      body: formData,
    });
    const uploadData = (await uploadRes.json()) as { id?: string; error?: any };
    if (!uploadData.id) {
      logger.error({ uploadData, phoneNumberId }, "WhatsApp audio media upload failed");
      return false;
    }

    // Step 2: Send audio message using uploaded media ID
    const sendRes = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${whatsappToken}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: toPhone,
        type: "audio",
        audio: { id: uploadData.id },
      }),
    });
    const sendData = (await sendRes.json()) as { messages?: Array<{ id: string }>; error?: any };
    if (sendData.messages && sendData.messages.length > 0) {
      logger.info({ toPhone, mediaId: uploadData.id }, "Sent WhatsApp voice note successfully");
      return true;
    }
    logger.warn({ sendData, toPhone }, "WhatsApp send audio message returned no message ID");
    return false;
  } catch (err) {
    logger.error({ err, toPhone }, "Failed to send voice note to WhatsApp");
    return false;
  }
}
