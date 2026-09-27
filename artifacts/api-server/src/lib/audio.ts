import OpenAI, { toFile } from "openai";
import { getSupportAiSettings } from "./supportAi";
import { companiesTable } from "@workspace/db";
import { type InferSelectModel } from "drizzle-orm";

export async function downloadTelegramAudio(telegramToken: string, fileId: string): Promise<Buffer> {
  const getFileRes = await fetch(`https://api.telegram.org/bot${telegramToken}/getFile?file_id=${fileId}`);
  const getFileData = await getFileRes.json();
  const filePath = getFileData.result.file_path;
  const fileUrl = `https://api.telegram.org/file/bot${telegramToken}/${filePath}`;
  
  const response = await fetch(fileUrl);
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function downloadWhatsAppAudio(whatsappToken: string, mediaId: string): Promise<Buffer> {
  const getUrlRes = await fetch(`https://graph.facebook.com/v17.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${whatsappToken}` },
  });
  const getUrlData = await getUrlRes.json();
  const mediaUrl = getUrlData.url;
  
  const response = await fetch(mediaUrl, {
    headers: { Authorization: `Bearer ${whatsappToken}` },
  });
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function transcribeAudio(company: InferSelectModel<typeof companiesTable>, buffer: Buffer, filename: string): Promise<string> {
  let apiKey = company.aiAgentApiKey;
  let useCompanyKey = company.aiAgentProvider === "openai";

  if (!useCompanyKey) {
    const supportAi = await getSupportAiSettings();
    if (supportAi && supportAi.provider === "openai") {
      apiKey = supportAi.apiKey;
    } else {
      throw new Error("No OpenAI API Key available for Whisper STT (Company does not use OpenAI and Support AI is not OpenAI).");
    }
  }

  const openai = new OpenAI({ apiKey });
  const file = await toFile(buffer, filename);
  
  const transcription = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1",
  });
  
  return transcription.text;
}
