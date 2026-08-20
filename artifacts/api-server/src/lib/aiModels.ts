import { db, adminConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

export type AiProviderId = "openai" | "anthropic" | "google" | "openrouter";

export interface SyncedAiModel {
  id: string;
  label: string;
  free: boolean;
}

export type AiModelCatalog = Record<AiProviderId, SyncedAiModel[]>;

const FALLBACK_MODELS: AiModelCatalog = {
  openai: [
    "gpt-4o-mini", "gpt-3.5-turbo", "gpt-4o", "gpt-4-turbo", "gpt-4",
    "o3-mini", "o1", "o1-mini", "o3",
  ].map((id) => ({ id, label: id, free: id.includes("mini") || id === "gpt-3.5-turbo" || id === "o3-mini" })),
  anthropic: [
    "claude-3-haiku-20240307", "claude-3-5-haiku-20241022",
    "claude-3-5-sonnet-20241022", "claude-3-opus-20240229",
    "claude-3-sonnet-20240229", "claude-opus-4-5", "claude-sonnet-4-5",
  ].map((id) => ({ id, label: id, free: id.includes("haiku") })),
  google: [
    "gemini-2.0-flash-lite", "gemini-1.5-flash", "gemini-2.0-flash",
    "gemini-1.5-pro", "gemini-2.5-flash-preview", "gemini-2.5-pro-preview",
    "gemini-2.5-pro", "gemini-3.7-flash", "gemini-3.6-flash",
    "gemini-3.5-flash", "gemini-3.1-pro", "gemini-3.1-flash-lite",
    "gemini-3.5-flash-lite",
  ].map((id) => ({ id, label: id, free: id.includes("flash") && !id.includes("preview") })),
  openrouter: [
    "google/gemma-4-31b-it:free", "openai/gpt-oss-20b:free",
    "nvidia/nemotron-3-super-120b-a12b:free", "nvidia/nemotron-nano-9b-v2:free",
    "deepseek/deepseek-v4-flash", "deepseek/deepseek-r1", "deepseek/deepseek-v3",
    "anthropic/claude-3.5-sonnet", "openai/gpt-4o", "openai/gpt-4o-mini",
    "google/gemini-pro-1.5", "mistralai/mistral-large",
    "meta-llama/llama-3.3-70b-instruct",
  ].map((id) => ({ id, label: id, free: id.endsWith(":free") })),
};

let catalog: AiModelCatalog = cloneCatalog(FALLBACK_MODELS);
let lastSyncedAt: Date | null = null;
let syncPromise: Promise<AiModelCatalog> | null = null;

function cloneCatalog(source: AiModelCatalog): AiModelCatalog {
  return {
    openai: source.openai.map((model) => ({ ...model })),
    anthropic: source.anthropic.map((model) => ({ ...model })),
    google: source.google.map((model) => ({ ...model })),
    openrouter: source.openrouter.map((model) => ({ ...model })),
  };
}

function displayLabel(id: string, displayName?: string): string {
  if (displayName?.trim()) return displayName.trim();
  const lastPart = id.split("/").pop() ?? id;
  return lastPart
    .replace(/:free$/i, " (Free)")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function dedupeAndSort(models: SyncedAiModel[]): SyncedAiModel[] {
  const unique = new Map<string, SyncedAiModel>();
  for (const model of models) {
    if (model.id.trim()) unique.set(model.id, model);
  }
  return [...unique.values()].sort((a, b) => {
    if (a.free !== b.free) return a.free ? -1 : 1;
    return a.label.localeCompare(b.label);
  });
}

async function fetchJson(url: string, init?: RequestInit): Promise<any> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}`);
  return response.json();
}

async function getProviderKeys(): Promise<Record<AiProviderId, string>> {
  const rows = await db
    .select()
    .from(adminConfigTable)
    .where(eq(adminConfigTable.key, "ai_test_key_openai"))
    .catch(() => []);
  const config = new Map(rows.map((row) => [row.key, row.value ?? ""]));

  // Support AI keys and environment keys are fallbacks for model discovery only.
  const supportRows = await db
    .select()
    .from(adminConfigTable)
    .where(eq(adminConfigTable.key, "support_ai_api_key"))
    .catch(() => []);
  const supportKey = supportRows[0]?.value ?? "";
  const supportProviderRows = await db
    .select()
    .from(adminConfigTable)
    .where(eq(adminConfigTable.key, "support_ai_provider"))
    .catch(() => []);
  const supportProvider = supportProviderRows[0]?.value as AiProviderId | undefined;

  return {
    openai: config.get("ai_test_key_openai") || (supportProvider === "openai" ? supportKey : "") || process.env.OPENAI_API_KEY || "",
    anthropic: config.get("ai_test_key_anthropic") || (supportProvider === "anthropic" ? supportKey : "") || "",
    google: config.get("ai_test_key_google") || (supportProvider === "google" ? supportKey : "") || "",
    openrouter: config.get("ai_test_key_openrouter") || (supportProvider === "openrouter" ? supportKey : "") || process.env.OPENROUTER_API_KEY || "",
  };
}

function isOpenAiChatModel(id: string): boolean {
  return /^(gpt-|o[1-9](?:-|$)|chatgpt|codex)/i.test(id)
    && !/(embedding|moderation|whisper|tts|dall-e|search|realtime)/i.test(id);
}

async function syncOpenAi(apiKey: string): Promise<SyncedAiModel[]> {
  if (!apiKey) return FALLBACK_MODELS.openai;
  const data = await fetchJson("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  return (data.data ?? [])
    .filter((model: any) => isOpenAiChatModel(String(model.id)))
    .map((model: any) => ({
      id: String(model.id),
      label: displayLabel(String(model.id)),
      free: false,
    }));
}

async function syncAnthropic(apiKey: string): Promise<SyncedAiModel[]> {
  if (!apiKey) return FALLBACK_MODELS.anthropic;
  const data = await fetchJson("https://api.anthropic.com/v1/models?limit=1000", {
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
  });
  return (data.data ?? []).map((model: any) => ({
    id: String(model.id),
    label: displayLabel(String(model.id), model.display_name),
    free: false,
  }));
}

async function syncGoogle(apiKey: string): Promise<SyncedAiModel[]> {
  if (!apiKey) return FALLBACK_MODELS.google;
  const data = await fetchJson(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}&pageSize=1000`);
  return (data.models ?? [])
    .filter((model: any) => (model.supportedGenerationMethods ?? []).includes("generateContent"))
    .map((model: any) => {
      const id = String(model.name ?? "").replace(/^models\//, "");
      return {
        id,
        label: displayLabel(id, model.displayName),
        free: false,
      };
    })
    .filter((model: SyncedAiModel) => model.id.startsWith("gemini"));
}

async function syncOpenRouter(): Promise<SyncedAiModel[]> {
  const data = await fetchJson("https://openrouter.ai/api/v1/models");
  return (data.data ?? []).map((model: any) => {
    const id = String(model.id);
    const pricing = model.pricing ?? {};
    return {
      id,
      label: displayLabel(id, model.name),
      free: id.endsWith(":free")
        || (Number(pricing.prompt ?? -1) === 0 && Number(pricing.completion ?? -1) === 0),
    };
  });
}

export async function refreshAiModels(): Promise<AiModelCatalog> {
  if (syncPromise) return syncPromise;
  syncPromise = (async () => {
    const keys = await getProviderKeys();
    const providers: Array<[AiProviderId, () => Promise<SyncedAiModel[]>]> = [
      ["openai", () => syncOpenAi(keys.openai)],
      ["anthropic", () => syncAnthropic(keys.anthropic)],
      ["google", () => syncGoogle(keys.google)],
      ["openrouter", syncOpenRouter],
    ];

    const next = cloneCatalog(FALLBACK_MODELS);
    await Promise.all(providers.map(async ([provider, sync]) => {
      try {
        const models = await sync();
        if (models.length > 0) next[provider] = dedupeAndSort(models);
      } catch (error) {
        logger.warn({ provider, err: error }, "AI model catalog sync failed; using fallback catalog");
      }
    }));

    catalog = next;
    lastSyncedAt = new Date();
    return cloneCatalog(catalog);
  })().finally(() => {
    syncPromise = null;
  });
  return syncPromise;
}

export async function getAiModelCatalog(): Promise<{ providers: AiModelCatalog; syncedAt: string | null }> {
  const oneHour = 60 * 60 * 1000;
  if (!lastSyncedAt || Date.now() - lastSyncedAt.getTime() >= oneHour) {
    await refreshAiModels();
  }
  return {
    providers: cloneCatalog(catalog),
    syncedAt: lastSyncedAt?.toISOString() ?? null,
  };
}
