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
    "gpt-4o-mini", "gpt-3.5-turbo", "o3-mini", "o1-mini", "gpt-4o", "chatgpt-4o-latest", "gpt-4-turbo", "gpt-4",
    "o1", "o3",
  ].map((id) => ({ id, label: displayLabel(id), free: isOpenAiFreeModel(id) })),
  anthropic: [
    "claude-3-5-haiku-20241022",
    "claude-3-haiku-20240307",
    "claude-3-7-sonnet-20250219",
    "claude-3-5-sonnet-20241022",
    "claude-3-opus-20240229",
    "claude-3-sonnet-20240229",
  ].map((id) => ({
    id,
    label: id === "claude-3-5-haiku-20241022"
      ? "Claude 3.5 Haiku ⭐ (Recommended Free Tier)"
      : id === "claude-3-haiku-20240307"
      ? "Claude 3 Haiku (Free Tier)"
      : id === "claude-3-7-sonnet-20250219"
      ? "Claude 3.7 Sonnet ⭐ (Flagship Hybrid Reasoning)"
      : id === "claude-3-5-sonnet-20241022"
      ? "Claude 3.5 Sonnet (Advanced & Coding)"
      : id === "claude-3-opus-20240229"
      ? "Claude 3 Opus (Deep Reasoning & Analysis)"
      : id === "claude-3-sonnet-20240229"
      ? "Claude 3 Sonnet (Balanced)"
      : displayLabel(id),
    free: isAnthropicFreeModel(id),
  })),
  google: [
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-1.5-flash",
    "gemini-1.5-flash-8b",
    "gemini-1.5-pro",
    "gemini-2.0-pro-exp-02-05",
    "gemini-2.5-pro",
  ].map((id) => ({ id, label: displayLabel(id), free: isGoogleFreeModel(id) })),
  openrouter: [
    "openrouter/free",
    "google/gemma-4-31b-it:free",
    "nvidia/nemotron-3.5-lightning:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "meta-llama/llama-3.1-8b-instruct:free",
    "deepseek/deepseek-r1:free",
    "deepseek/deepseek-v3-base:free",
    "mistralai/mistral-7b-instruct:free",
    "qwen/qwen3-8b:free",
    "nvidia/nemotron-3-super-120b-a12b:free",
    "deepseek/deepseek-v4-flash",
    "anthropic/claude-3.7-sonnet",
    "anthropic/claude-3.5-sonnet",
    "openai/gpt-4o",
    "openai/gpt-4o-mini",
    "openai/o3-mini",
    "openai/o1",
    "deepseek/deepseek-r1",
    "deepseek/deepseek-v3",
    "google/gemini-2.5-pro",
    "google/gemini-pro-1.5",
    "google/gemini-2.0-flash-001",
    "mistralai/mistral-large",
    "meta-llama/llama-3.3-70b-instruct",
    "qwen/qwen-2.5-72b-instruct",
  ].map((id) => ({
    id,
    label: id === "openrouter/free" ? "OpenRouter Free Auto (Recommended)" : displayLabel(id),
    free: isOpenRouterFreeModel(id),
  })),
};

export function isAnthropicFreeModel(modelId?: string | null): boolean {
  if (!modelId) return false;
  const normalized = modelId.toLowerCase().trim().replace(/^anthropic\//i, "");
  return normalized.includes("haiku");
}

export function isAnthropicPaidModel(modelId?: string | null): boolean {
  if (!modelId) return false;
  return !isAnthropicFreeModel(modelId);
}

export function sanitizeAnthropicModel(model?: string | null): string {
  if (!model || !model.trim()) return "claude-3-5-haiku-20241022";
  const trimmed = model.trim().replace(/^anthropic\//i, "");

  // Haiku aliases (Free tier)
  if (
    trimmed === "claude-3-5-haiku" ||
    trimmed === "claude-3.5-haiku" ||
    trimmed === "claude-haiku" ||
    trimmed === "claude-haiku-4-5" ||
    trimmed === "haiku" ||
    trimmed === "claude-3-5-haiku-latest"
  ) {
    return "claude-3-5-haiku-20241022";
  }
  if (
    trimmed === "claude-3-haiku" ||
    trimmed === "claude-3.0-haiku" ||
    trimmed === "claude-3-haiku-latest"
  ) {
    return "claude-3-haiku-20240307";
  }

  // Sonnet & Opus aliases (Advanced & Paid models)
  if (
    trimmed === "claude-3-7-sonnet" ||
    trimmed === "claude-3.7-sonnet" ||
    trimmed === "claude-3-7-sonnet-latest" ||
    trimmed === "claude-sonnet-4-5" ||
    trimmed === "claude-3-7-sonnet-20250219"
  ) {
    return "claude-3-7-sonnet-20250219";
  }
  if (
    trimmed === "claude-3-5-sonnet" ||
    trimmed === "claude-3.5-sonnet" ||
    trimmed === "claude-sonnet" ||
    trimmed === "claude-3-5-sonnet-latest" ||
    trimmed === "claude-sonnet-latest" ||
    trimmed === "claude-3-5-sonnet-20241022"
  ) {
    return "claude-3-5-sonnet-20241022";
  }
  if (
    trimmed === "claude-3-opus" ||
    trimmed === "claude-3.0-opus" ||
    trimmed === "claude-opus" ||
    trimmed === "claude-3-opus-latest" ||
    trimmed === "claude-opus-latest" ||
    trimmed === "claude-opus-4-5" ||
    trimmed === "claude-3-opus-20240229"
  ) {
    return "claude-3-opus-20240229";
  }
  if (
    trimmed === "claude-3-sonnet" ||
    trimmed === "claude-3.0-sonnet" ||
    trimmed === "claude-3-sonnet-latest" ||
    trimmed === "claude-3-sonnet-20240229"
  ) {
    return "claude-3-sonnet-20240229";
  }
  return trimmed;
}

export function extractAnthropicText(content: any): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const textBlocks = content.filter((b: any) => b && (b.type === "text" || typeof b.text === "string"));
    if (textBlocks.length > 0) {
      return textBlocks.map((b: any) => b.text || "").join("\n").trim();
    }
    return (content[0] as any)?.text || (content[0] as any)?.value || "";
  }
  return "";
}

export function formatAnthropicMessages(
  history: Array<{ role: string; content: string }>,
  userMessage?: string
): Array<{ role: "user" | "assistant"; content: string }> {
  const rawList: Array<{ role: "user" | "assistant"; content: string }> = [];

  for (const h of history) {
    const text = (h.content || "").trim();
    if (!text) continue;
    const role: "user" | "assistant" = h.role === "assistant" ? "assistant" : "user";
    rawList.push({ role, content: text });
  }

  if (userMessage && userMessage.trim()) {
    rawList.push({ role: "user", content: userMessage.trim() });
  }

  if (rawList.length === 0) {
    return [{ role: "user", content: "hi" }];
  }

  // Ensure first turn is from 'user'
  while (rawList.length > 0 && rawList[0].role !== "user") {
    rawList.shift();
  }

  if (rawList.length === 0) {
    return [{ role: "user", content: userMessage?.trim() || "hi" }];
  }

  // Merge consecutive turns with the same role into one turn to maintain strict alternation
  const consolidated: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const item of rawList) {
    const prev = consolidated[consolidated.length - 1];
    if (prev && prev.role === item.role) {
      prev.content += `\n${item.content}`;
    } else {
      consolidated.push({ role: item.role, content: item.content });
    }
  }

  return consolidated;
}

export function sanitizeGoogleModel(model?: string | null): string {
  if (!model || !model.trim()) return "gemini-2.0-flash";
  const trimmed = model.trim().replace(/^models\//, "");
  // Deprecated legacy models -> redirect to current active equivalents
  if (trimmed === "gemini-pro" || trimmed === "gemini-1.0-pro") {
    return "gemini-1.5-pro";
  }
  if (trimmed === "gemini-flash") {
    return "gemini-2.0-flash";
  }
  return trimmed;
}

export function isGoogleFreeModel(modelId: string): boolean {
  const normalized = modelId.toLowerCase().replace(/^models\//, "");
  // Pro models are Google's Advanced & Paid flagship models
  if (normalized.includes("pro")) return false;
  return (
    normalized.includes("flash") ||
    normalized.includes("lite") ||
    normalized.includes("8b") ||
    normalized.endsWith(":free")
  );
}

export function sanitizeOpenAiModel(model?: string | null): string {
  if (!model || !model.trim()) return "gpt-4o-mini";
  const trimmed = model.trim().replace(/^openai\//i, "").replace(/^models\//i, "");
  // Deprecated, discontinued or legacy chat/completion models fallback to recommended free tier model
  if (
    trimmed === "gpt-3.5-turbo-16k" ||
    trimmed === "gpt-3.5-turbo-0301" ||
    trimmed === "gpt-3.5-turbo-0613" ||
    trimmed === "text-davinci-003" ||
    trimmed === "text-davinci-002" ||
    trimmed === "text-curie-001" ||
    trimmed === "text-babbage-001" ||
    trimmed === "text-ada-001" ||
    trimmed === "code-davinci-002" ||
    trimmed === "gpt-3.5-turbo-instruct"
  ) {
    return "gpt-4o-mini";
  }
  return trimmed;
}

export function isOpenAiFreeModel(modelId: string): boolean {
  const normalized = modelId.toLowerCase().trim().replace(/^openai\//i, "").replace(/^models\//i, "");
  return (
    normalized.includes("mini") ||
    normalized.includes("3.5-turbo") ||
    normalized.includes(":free") ||
    normalized.endsWith("-free")
  );
}

export function isOpenAiReasoningModel(modelId?: string | null): boolean {
  if (!modelId) return false;
  const normalized = modelId.toLowerCase().trim().replace(/^openai\//i, "").replace(/^models\//i, "");
  return normalized.startsWith("o1") || normalized.startsWith("o3") || normalized.startsWith("o4");
}

export function buildOpenAiChatParams(
  model: string,
  messages: Array<{ role: string; content: string }>,
  options?: { maxTokens?: number; stream?: boolean; temperature?: number }
): {
  model: string;
  messages: Array<any>;
  max_tokens?: number;
  max_completion_tokens?: number;
  stream?: boolean;
  temperature?: number;
} {
  const effectiveModel = sanitizeOpenAiModel(model);
  const isReasoning = isOpenAiReasoningModel(effectiveModel);

  const formattedMessages = messages.map((m) => {
    if (isReasoning && m.role === "system") {
      return { role: "developer", content: m.content };
    }
    return { role: m.role, content: m.content };
  });

  const params: any = {
    model: effectiveModel,
    messages: formattedMessages,
  };

  if (options?.stream !== undefined) {
    params.stream = options.stream;
  }

  // OpenAI reasoning models (o1, o3, etc.) reject any 'temperature' parameter
  if (!isReasoning && options?.temperature !== undefined) {
    params.temperature = options.temperature;
  }

  if (options?.maxTokens !== undefined) {
    if (isReasoning) {
      // Reasoning models (o1, o3, etc.) consume completion tokens for hidden thinking.
      // Ensuring a minimum of 300 tokens prevents reasoning models from failing or truncating during internal thought.
      params.max_completion_tokens = Math.max(options.maxTokens, 300);
    } else {
      params.max_tokens = options.maxTokens;
    }
  }

  return params;
}

export const AI_MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // OpenAI Advanced, Paid & Free models
  "gpt-4o":                             { input: 2.50,  output: 10.00 },
  "gpt-4o-mini":                        { input: 0.15,  output: 0.60  },
  "gpt-4o-2024-08-06":                  { input: 2.50,  output: 10.00 },
  "gpt-4o-2024-11-20":                  { input: 2.50,  output: 10.00 },
  "chatgpt-4o-latest":                  { input: 5.00,  output: 15.00 },
  "gpt-4-turbo":                        { input: 10.00, output: 30.00 },
  "gpt-4":                              { input: 30.00, output: 60.00 },
  "gpt-3.5-turbo":                      { input: 0.50,  output: 1.50  },
  "o1":                                 { input: 15.00, output: 60.00 },
  "o1-preview":                         { input: 15.00, output: 60.00 },
  "o1-mini":                            { input: 3.00,  output: 12.00 },
  "o3":                                 { input: 15.00, output: 60.00 },
  "o3-mini":                            { input: 1.10,  output: 4.40  },
  // Anthropic Advanced, Paid & Free models
  "claude-3-7-sonnet-20250219":         { input: 3.00,  output: 15.00 },
  "claude-3-7-sonnet":                  { input: 3.00,  output: 15.00 },
  "claude-3-5-sonnet-20241022":         { input: 3.00,  output: 15.00 },
  "claude-3-5-sonnet":                  { input: 3.00,  output: 15.00 },
  "claude-3-5-haiku-20241022":          { input: 0.80,  output: 4.00  },
  "claude-3-5-haiku":                   { input: 0.80,  output: 4.00  },
  "claude-3-opus-20240229":             { input: 15.00, output: 75.00 },
  "claude-3-opus":                      { input: 15.00, output: 75.00 },
  "claude-3-haiku-20240307":            { input: 0.25,  output: 1.25  },
  "claude-3-haiku":                     { input: 0.25,  output: 1.25  },
  "claude-3-sonnet-20240229":           { input: 3.00,  output: 15.00 },
  "claude-3-sonnet":                    { input: 3.00,  output: 15.00 },
  "claude-sonnet-4-5":                  { input: 3.00,  output: 15.00 },
  "claude-opus-4-5":                    { input: 15.00, output: 75.00 },
  // Google
  "gemini-1.5-pro":                     { input: 1.25,  output: 5.00  },
  "gemini-1.5-pro-latest":              { input: 1.25,  output: 5.00  },
  "gemini-2.0-pro-exp-02-05":           { input: 1.25,  output: 5.00  },
  "gemini-2.5-pro":                     { input: 1.25,  output: 5.00  },
  "gemini-1.5-flash":                   { input: 0.075, output: 0.30  },
  "gemini-1.5-flash-8b":                { input: 0.0375, output: 0.15 },
  "gemini-2.0-flash":                   { input: 0.10,  output: 0.40  },
  "gemini-2.0-flash-lite":              { input: 0.075, output: 0.30  },
  "gemini-2.5-flash":                   { input: 0.10,  output: 0.40  },
  // OpenRouter & Others
  "anthropic/claude-3.7-sonnet":        { input: 3.00,  output: 15.00 },
  "anthropic/claude-3.5-sonnet":        { input: 3.00,  output: 15.00 },
  "openai/gpt-4o":                      { input: 2.50,  output: 10.00 },
  "openai/gpt-4o-mini":                 { input: 0.15,  output: 0.60  },
  "openai/o1":                          { input: 15.00, output: 60.00 },
  "openai/o3-mini":                     { input: 1.10,  output: 4.40  },
  "deepseek/deepseek-r1":               { input: 0.55,  output: 2.19  },
  "deepseek/deepseek-v3":               { input: 0.27,  output: 1.10  },
  "deepseek/deepseek-chat":             { input: 0.27,  output: 1.10  },
  "deepseek/deepseek-v4-flash":         { input: 0.14,  output: 0.28  },
  "google/gemini-2.5-pro":              { input: 1.25,  output: 5.00  },
  "google/gemini-pro-1.5":              { input: 1.25,  output: 5.00  },
  "google/gemini-2.0-flash-001":        { input: 0.10,  output: 0.40  },
  "mistralai/mistral-large":            { input: 2.00,  output: 6.00  },
  "meta-llama/llama-3.3-70b-instruct":  { input: 0.12,  output: 0.30  },
  "qwen/qwen-2.5-72b-instruct":         { input: 0.35,  output: 0.40  },
};

export function getModelPricing(modelId?: string | null): { input: number; output: number } {
  if (!modelId) return { input: 0.15, output: 0.60 };
  const clean = modelId.trim();
  if (isOpenRouterFreeModel(clean)) return { input: 0, output: 0 };
  if (AI_MODEL_PRICING[clean]) return AI_MODEL_PRICING[clean];
  const withoutPrefix = clean.replace(/^(openai|models|google|anthropic|mistralai|meta-llama|deepseek|qwen)\//i, "");
  if (isOpenRouterFreeModel(withoutPrefix)) return { input: 0, output: 0 };
  if (AI_MODEL_PRICING[withoutPrefix]) return AI_MODEL_PRICING[withoutPrefix];

  const anthropicSanitized = sanitizeAnthropicModel(clean);
  if (AI_MODEL_PRICING[anthropicSanitized]) return AI_MODEL_PRICING[anthropicSanitized];

  const lower = withoutPrefix.toLowerCase();
  if (lower.startsWith("gemini") || lower.includes("gemini")) {
    if (lower.includes("pro")) {
      return { input: 1.25, output: 5.00 };
    }
    return { input: 0.10, output: 0.40 };
  }
  if (lower.startsWith("claude") || lower.includes("claude")) {
    if (lower.includes("haiku")) return { input: 0.80, output: 4.00 };
    if (lower.includes("opus")) return { input: 15.00, output: 75.00 };
    return { input: 3.00, output: 15.00 };
  }
  if (lower.startsWith("gpt-4o-mini") || lower.includes("mini")) {
    return { input: 0.15, output: 0.60 };
  }
  if (lower.startsWith("gpt-4") || lower.includes("gpt-4")) {
    return { input: 2.50, output: 10.00 };
  }
  if (lower.startsWith("deepseek")) {
    if (lower.includes("r1")) return { input: 0.55, output: 2.19 };
    return { input: 0.27, output: 1.10 };
  }

  return { input: 0.15, output: 0.60 };
}

export interface GeminiChatTurn {
  role: "user" | "model";
  parts: Array<{ text: string }>;
}

export function formatGeminiHistory(
  rawHistory: Array<{ role: string; content: string }>
): GeminiChatTurn[] {
  const result: Array<{ role: "user" | "model"; text: string }> = [];

  for (const item of rawHistory) {
    const text = (item.content || "").trim();
    if (!text) continue;
    const role: "user" | "model" = (item.role === "assistant" || item.role === "model") ? "model" : "user";

    // Gemini requires the contents array in multi-turn chat to begin with a user turn
    if (result.length === 0 && role === "model") {
      continue;
    }

    // Merge consecutive turns with the same role into one turn to strictly maintain alternating turns
    const prev = result[result.length - 1];
    if (prev && prev.role === role) {
      prev.text += `\n${text}`;
    } else {
      result.push({ role, text });
    }
  }

  // If history ends with a user turn, when sendMessage(userMessage) is called,
  // that would append a second consecutive user turn. Trim trailing user turn.
  while (result.length > 0 && result[result.length - 1].role === "user") {
    result.pop();
  }

  return result.map((t) => ({
    role: t.role,
    parts: [{ text: t.text }],
  }));
}

export function isOpenRouterFreeModel(modelId?: string | null): boolean {
  if (!modelId) return false;
  const lower = modelId.toLowerCase().trim();
  return lower.endsWith(":free") || lower === "openrouter/free" || lower.endsWith("/free");
}

export function stripThinkingTags(text?: string | null): string {
  if (!text) return "";
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  return cleaned || text.trim();
}

export function getOpenRouterHeaders(): Record<string, string> {
  return {
    "HTTP-Referer": "https://chatpot.ai",
    "X-Title": "AI Chatbot Platform",
  };
}

const COMMON_OPENROUTER_ALIASES: Record<string, string> = {
  // OpenAI
  "gpt-4o": "openai/gpt-4o",
  "gpt-4o-mini": "openai/gpt-4o-mini",
  "gpt-4-turbo": "openai/gpt-4-turbo",
  "gpt-4": "openai/gpt-4",
  "gpt-3.5-turbo": "openai/gpt-3.5-turbo",
  "o1": "openai/o1",
  "o1-mini": "openai/o1-mini",
  "o3-mini": "openai/o3-mini",
  // Anthropic
  "claude-3.7-sonnet": "anthropic/claude-3.7-sonnet",
  "claude-3-7-sonnet": "anthropic/claude-3.7-sonnet",
  "claude-3.5-sonnet": "anthropic/claude-3.5-sonnet",
  "claude-3-5-sonnet": "anthropic/claude-3.5-sonnet",
  "claude-3-5-sonnet-20241022": "anthropic/claude-3.5-sonnet",
  "claude-3-5-haiku": "anthropic/claude-3.5-haiku",
  "claude-3-5-haiku-20241022": "anthropic/claude-3.5-haiku",
  "claude-3-opus": "anthropic/claude-3-opus",
  "claude-3-opus-20240229": "anthropic/claude-3-opus",
  // DeepSeek
  "deepseek-r1": "deepseek/deepseek-r1",
  "deepseek-v3": "deepseek/deepseek-v3",
  "deepseek-v4-flash": "deepseek/deepseek-v4-flash",
  "deepseek-chat": "deepseek/deepseek-chat",
  // Google
  "gemini-pro-1.5": "google/gemini-pro-1.5",
  "gemini-1.5-pro": "google/gemini-pro-1.5",
  "gemini-2.0-flash": "google/gemini-2.0-flash-001",
  "gemini-2.0-flash-001": "google/gemini-2.0-flash-001",
  "gemini-2.5-pro": "google/gemini-2.5-pro",
  // Mistral & Meta & Qwen
  "mistral-large": "mistralai/mistral-large",
  "mistral-7b-instruct": "mistralai/mistral-7b-instruct",
  "llama-3.3-70b-instruct": "meta-llama/llama-3.3-70b-instruct",
  "llama-3.1-8b-instruct": "meta-llama/llama-3.1-8b-instruct",
  "llama-3.1-70b-instruct": "meta-llama/llama-3.1-70b-instruct",
  "qwen-2.5-72b-instruct": "qwen/qwen-2.5-72b-instruct",
};

export function sanitizeOpenRouterModel(model?: string | null): string {
  if (!model || !model.trim()) return "openrouter/free";
  const trimmed = model.trim();
  if (trimmed === "free" || trimmed === "openrouter/auto") {
    return "openrouter/free";
  }
  if (
    trimmed === "nvidia/nemotron-nano-9b-v2:free" ||
    trimmed.includes("nemotron-nano-9b") ||
    trimmed === "openai/gpt-oss-20b:free" ||
    trimmed === "google/gemini-2.0-flash-exp:free" ||
    trimmed === "google/gemini-2.0-pro-exp-02-05:free"
  ) {
    return "nvidia/nemotron-3.5-lightning:free";
  }
  if (COMMON_OPENROUTER_ALIASES[trimmed]) {
    return COMMON_OPENROUTER_ALIASES[trimmed];
  }
  return trimmed;
}

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
    .catch(() => [] as any[]);
  const config = new Map(
    rows
      .filter((row) => row.key.startsWith("ai_test_key_"))
      .map((row) => [row.key, row.value ?? ""]),
  );

  // Support AI keys and environment keys are fallbacks for model discovery only.
  const supportRows = await db
    .select()
    .from(adminConfigTable)
    .where(eq(adminConfigTable.key, "support_ai_api_key"))
    .catch(() => [] as any[]);
  const supportKey = supportRows[0]?.value ?? "";
  const supportProviderRows = await db
    .select()
    .from(adminConfigTable)
    .where(eq(adminConfigTable.key, "support_ai_provider"))
    .catch(() => [] as any[]);
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
    && !/(embedding|moderation|whisper|tts|dall-e|search|realtime|instruct)/i.test(id);
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
      free: isOpenAiFreeModel(String(model.id)),
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
    free: isAnthropicFreeModel(String(model.id)),
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
        free: isGoogleFreeModel(id),
      };
    })
    .filter((model: SyncedAiModel) => model.id.startsWith("gemini"));
}

async function syncOpenRouter(): Promise<SyncedAiModel[]> {
  const data = await fetchJson("https://openrouter.ai/api/v1/models");
  const models: SyncedAiModel[] = (data.data ?? []).map((model: any) => {
    const id = String(model.id);
    const pricing = model.pricing ?? {};
    return {
      id,
      label: id === "openrouter/free" ? "OpenRouter Free Auto (Recommended)" : displayLabel(id, model.name),
      free: isOpenRouterFreeModel(id)
        || (Number(pricing.prompt ?? -1) === 0 && Number(pricing.completion ?? -1) === 0),
    };
  });

  if (!models.some((m) => m.id === "openrouter/free")) {
    models.unshift({
      id: "openrouter/free",
      label: "OpenRouter Free Auto (Recommended)",
      free: true,
    });
  }

  return models;
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
    // Refresh in background without blocking the HTTP response
    refreshAiModels().catch((err) => {
      logger.warn({ err }, "Background AI model catalog sync failed");
    });
  }
  return {
    providers: cloneCatalog(catalog),
    syncedAt: lastSyncedAt?.toISOString() ?? null,
  };
}
