export type DynamicAiModel = {
  id: string;
  label: string;
  free: boolean;
};

export type AiModelCatalogResponse = {
  providers: Record<string, DynamicAiModel[]>;
  syncedAt: string | null;
};

export const AI_PROVIDERS = {
  openai: {
    label: "OpenAI",
    icon: "🟢",
    keyLabel: "OPENAI_API_KEY",
    keyPlaceholder: "sk-...",
    keyLink: "https://platform.openai.com/api-keys",
    freeTier: "Free trial credits available on sign-up",
    hasFreeTier: true,
    models: [
      { value: "gpt-4o-mini", label: "GPT-4o mini ⭐ Recommended (Free Tier)", free: true },
      { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo (Free Tier, Fast)", free: true },
      { value: "o3-mini", label: "o3-mini (Free Tier, Reasoning)", free: true },
      { value: "o1-mini", label: "o1-mini (Free Tier, Reasoning)", free: true },
      { value: "gpt-4o", label: "GPT-4o (Most Capable)", free: false },
      { value: "chatgpt-4o-latest", label: "ChatGPT-4o Latest (Dynamic Frontier)", free: false },
      { value: "gpt-4-turbo", label: "GPT-4 Turbo (Vision)", free: false },
      { value: "gpt-4", label: "GPT-4 (High Accuracy)", free: false },
      { value: "o1", label: "o1 (Frontier Reasoning)", free: false },
      { value: "o3", label: "o3 (Next-Gen Reasoning)", free: false },
    ],
  },
  anthropic: {
    label: "Anthropic",
    icon: "🟠",
    keyLabel: "ANTHROPIC_API_KEY",
    keyPlaceholder: "sk-ant-...",
    keyLink: "https://console.anthropic.com/settings/keys",
    freeTier: "Free tier: $5 credit on sign-up",
    hasFreeTier: true,
    models: [
      { value: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku ⭐ Recommended (Free Tier)", free: true },
      { value: "claude-3-haiku-20240307", label: "Claude 3 Haiku (Free Tier)", free: true },
      { value: "claude-3-7-sonnet-20250219", label: "Claude 3.7 Sonnet ⭐ (Flagship Hybrid Reasoning)", free: false },
      { value: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet (Advanced & Coding)", free: false },
      { value: "claude-3-opus-20240229", label: "Claude 3 Opus (Deep Reasoning & Analysis)", free: false },
      { value: "claude-3-sonnet-20240229", label: "Claude 3 Sonnet (Balanced)", free: false },
    ],
  },
  google: {
    label: "Google Gemini",
    icon: "🔵",
    keyLabel: "GOOGLE_AI_API_KEY",
    keyPlaceholder: "AIza...",
    keyLink: "https://aistudio.google.com/app/apikey",
    freeTier: "Free tier: Generous free quota (no credit card needed)",
    hasFreeTier: true,
    models: [
      { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash ⭐ Recommended (Fast & Economic)", free: true },
      { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash (Free Tier)", free: true },
      { value: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash-Lite (Free Tier, Fast)", free: true },
      { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash (Free Tier)", free: true },
      { value: "gemini-1.5-flash-8b", label: "Gemini 1.5 Flash-8B (Free Tier, Lightweight)", free: true },
      { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro (Flagship Reasoning, 2M Context)", free: false },
      { value: "gemini-2.0-pro-exp-02-05", label: "Gemini 2.0 Pro Experimental (Frontier Coding)", free: false },
      { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro (Next-Gen Reasoning & STEM)", free: false },
    ],
  },
  openrouter: {
    label: "OpenRouter",
    icon: "🟣",
    keyLabel: "OPENROUTER_API_KEY",
    keyPlaceholder: "sk-or-v1-...",
    keyLink: "https://openrouter.ai/keys",
    freeTier: "Free models available — no credit card required for free tier",
    hasFreeTier: true,
    models: [
      // ── Free models ─────────────────────────────────────────────────────────
      { value: "openrouter/free",                       label: "OpenRouter Free Auto ⭐ Recommended", free: true  },
      { value: "google/gemini-2.5-flash:free",          label: "Google Gemini 2.5 Flash (Free via OpenRouter)", free: true },
      { value: "google/gemma-4-31b-it:free",           label: "Google Gemma 4 31B (Free)",           free: true  },
      { value: "nvidia/nemotron-3.5-lightning:free",    label: "NVIDIA Nemotron 3.5 Lightning (Free)",free: true  },
      { value: "deepseek/deepseek-r1:free",             label: "DeepSeek R1 Reasoning (Free)",        free: true  },
      { value: "meta-llama/llama-3.3-70b-instruct:free",label: "Meta Llama 3.3 70B (Free)",          free: true  },
      { value: "meta-llama/llama-3.1-8b-instruct:free", label: "Meta Llama 3.1 8B (Free)",           free: true  },
      { value: "qwen/qwen3-8b:free",                    label: "Qwen3 8B (Free)",                     free: true  },
      { value: "mistralai/mistral-7b-instruct:free",    label: "Mistral 7B Instruct (Free)",          free: true  },
      { value: "deepseek/deepseek-v3-base:free",        label: "DeepSeek V3 Base (Free)",             free: true  },
      { value: "meta-llama/llama-4-scout:free",         label: "Meta Llama 4 Scout (Free)",           free: true  },
      { value: "meta-llama/llama-4-maverick:free",      label: "Meta Llama 4 Maverick (Free)",        free: true  },
      { value: "nvidia/nemotron-3-super-120b-a12b:free",label: "NVIDIA Nemotron Super 120B (Free)",  free: true  },
      // ── Paid models ─────────────────────────────────────────────────────────
      { value: "google/gemini-2.5-flash",               label: "Google Gemini 2.5 Flash ⭐ (via OpenRouter)", free: false },
      { value: "deepseek/deepseek-v4-flash",            label: "DeepSeek V4 Flash ⭐ Fast & affordable", free: false },
      { value: "anthropic/claude-sonnet-4.5",           label: "Claude Sonnet 4.5 ⭐ (Active via OpenRouter)", free: false },
      { value: "anthropic/claude-haiku-4.5",            label: "Claude Haiku 4.5 (via OpenRouter)",        free: false },
      { value: "openai/gpt-4o",                         label: "GPT-4o (via OpenRouter)",              free: false },
      { value: "openai/gpt-4o-mini",                    label: "GPT-4o mini (via OpenRouter)",         free: false },
      { value: "openai/o3-mini",                        label: "OpenAI o3-mini (Reasoning)",           free: false },
      { value: "openai/o1",                             label: "OpenAI o1 (Flagship Reasoning)",       free: false },
      { value: "deepseek/deepseek-r1",                  label: "DeepSeek R1 (paid, higher limits)",    free: false },
      { value: "deepseek/deepseek-v3",                  label: "DeepSeek V3 (671B Flagship)",          free: false },
      { value: "google/gemini-2.5-pro",                 label: "Gemini 2.5 Pro (via OpenRouter)",      free: false },
      { value: "google/gemini-2.5-flash",               label: "Gemini 2.5 Flash (via OpenRouter)",    free: false },
      { value: "google/gemini-2.0-flash-001",           label: "Gemini 2.0 Flash (via OpenRouter)",    free: false },
      { value: "mistralai/mistral-large",               label: "Mistral Large",                        free: false },
      { value: "meta-llama/llama-3.3-70b-instruct",     label: "Llama 3.3 70B Instruct",               free: false },
      { value: "qwen/qwen-2.5-72b-instruct",            label: "Qwen 2.5 72B Instruct",                free: false },
    ],
  },
} as const;

export type AiProvider = keyof typeof AI_PROVIDERS;

export function mergeDynamicModels<T extends { value: string; label: string; free: boolean }>(
  staticModels: readonly T[],
  dynamicModels: DynamicAiModel[] | undefined,
): T[] {
  const merged = new Map<string, T>();
  staticModels.forEach((model) => merged.set(model.value, model));
  dynamicModels?.forEach((model) => {
    if (!merged.has(model.id)) {
      merged.set(model.id, {
        value: model.id,
        label: model.label || model.id,
        free: Boolean(model.free),
      } as T);
    }
  });
  return [...merged.values()].sort((a, b) => {
    if (a.free !== b.free) return a.free ? -1 : 1;
    return (a.label || a.value || "").localeCompare(b.label || b.value || "");
  });
}

export interface ModelPricingDetails {
  inputPer1M: number;
  outputPer1M: number;
  blendedPer1M: number;
  pricePerToken: number;
  inputPerToken: number;
  outputPerToken: number;
  isFree: boolean;
  rateLabel: string;
}

function makePricingDetails(input: number, output: number, blended: number, isFreeOverride?: boolean): ModelPricingDetails {
  const isFree = isFreeOverride !== undefined ? isFreeOverride : blended === 0;
  const pricePerToken = blended / 1_000_000;
  return {
    inputPer1M: input,
    outputPer1M: output,
    blendedPer1M: blended,
    pricePerToken,
    inputPerToken: input / 1_000_000,
    outputPerToken: output / 1_000_000,
    isFree,
    rateLabel: isFree ? "Free ($0.00)" : `$${pricePerToken.toFixed(8)} / token ($${blended.toFixed(2)}/1M)`,
  };
}

export const AI_MODEL_STANDARD_PRICES: Record<string, { input: number; output: number; blended: number }> = {
  // Google
  "gemini-2.5-flash": { input: 0.10, output: 0.40, blended: 0.25 },
  "google/gemini-2.5-flash": { input: 0.10, output: 0.40, blended: 0.25 },
  "google/gemini-2.5-flash:free": { input: 0, output: 0, blended: 0 },
  "gemini-2.0-flash": { input: 0.10, output: 0.40, blended: 0.25 },
  "gemini-2.0-flash-lite": { input: 0.075, output: 0.30, blended: 0.1875 },
  "gemini-1.5-flash": { input: 0.075, output: 0.30, blended: 0.1875 },
  "gemini-1.5-flash-8b": { input: 0.0375, output: 0.15, blended: 0.0938 },
  "gemini-1.5-pro": { input: 1.25, output: 5.00, blended: 3.125 },
  "gemini-2.5-pro": { input: 1.25, output: 5.00, blended: 3.125 },
  "gemini-2.0-pro-exp-02-05": { input: 1.25, output: 5.00, blended: 3.125 },
  "google/gemini-2.5-pro": { input: 1.25, output: 5.00, blended: 3.125 },
  "google/gemini-pro-1.5": { input: 1.25, output: 5.00, blended: 3.125 },
  "google/gemini-2.0-flash-001": { input: 0.10, output: 0.40, blended: 0.25 },

  // OpenAI
  "gpt-4o-mini": { input: 0.15, output: 0.60, blended: 0.375 },
  "openai/gpt-4o-mini": { input: 0.15, output: 0.60, blended: 0.375 },
  "gpt-3.5-turbo": { input: 0.50, output: 1.50, blended: 1.00 },
  "o3-mini": { input: 1.10, output: 4.40, blended: 2.75 },
  "openai/o3-mini": { input: 1.10, output: 4.40, blended: 2.75 },
  "o1-mini": { input: 3.00, output: 12.00, blended: 7.50 },
  "gpt-4o": { input: 2.50, output: 10.00, blended: 6.25 },
  "openai/gpt-4o": { input: 2.50, output: 10.00, blended: 6.25 },
  "chatgpt-4o-latest": { input: 5.00, output: 15.00, blended: 10.00 },
  "gpt-4-turbo": { input: 10.00, output: 30.00, blended: 20.00 },
  "gpt-4": { input: 30.00, output: 60.00, blended: 45.00 },
  "o1": { input: 15.00, output: 60.00, blended: 37.50 },
  "openai/o1": { input: 15.00, output: 60.00, blended: 37.50 },
  "o3": { input: 15.00, output: 60.00, blended: 37.50 },

  // Anthropic
  "claude-3-5-haiku-20241022": { input: 0.80, output: 4.00, blended: 2.40 },
  "claude-3-5-haiku": { input: 0.80, output: 4.00, blended: 2.40 },
  "claude-3-haiku-20240307": { input: 0.25, output: 1.25, blended: 0.75 },
  "claude-3-haiku": { input: 0.25, output: 1.25, blended: 0.75 },
  "claude-3-7-sonnet-20250219": { input: 3.00, output: 15.00, blended: 9.00 },
  "claude-3-7-sonnet": { input: 3.00, output: 15.00, blended: 9.00 },
  "anthropic/claude-3.7-sonnet": { input: 3.00, output: 15.00, blended: 9.00 },
  "claude-3-5-sonnet-20241022": { input: 3.00, output: 15.00, blended: 9.00 },
  "claude-3-5-sonnet": { input: 3.00, output: 15.00, blended: 9.00 },
  "anthropic/claude-3.5-sonnet": { input: 3.00, output: 15.00, blended: 9.00 },
  "anthropic/claude-sonnet-4.5": { input: 3.00, output: 15.00, blended: 9.00 },
  "anthropic/claude-haiku-4.5":  { input: 0.80, output: 4.00,  blended: 2.40 },
  "claude-3-opus-20240229": { input: 15.00, output: 75.00, blended: 45.00 },
  "claude-3-opus": { input: 15.00, output: 75.00, blended: 45.00 },
  "claude-3-sonnet-20240229": { input: 3.00, output: 15.00, blended: 9.00 },

  // OpenRouter & Others
  "deepseek/deepseek-v4-flash": { input: 0.14, output: 0.28, blended: 0.21 },
  "deepseek/deepseek-v3": { input: 0.27, output: 1.10, blended: 0.685 },
  "deepseek/deepseek-chat": { input: 0.27, output: 1.10, blended: 0.685 },
  "deepseek/deepseek-r1": { input: 0.55, output: 2.19, blended: 1.37 },
  "mistralai/mistral-large": { input: 2.00, output: 6.00, blended: 4.00 },
  "meta-llama/llama-3.3-70b-instruct": { input: 0.12, output: 0.30, blended: 0.21 },
  "qwen/qwen-2.5-72b-instruct": { input: 0.35, output: 0.40, blended: 0.375 },
};

export function getModelPricingDetails(modelId?: string | null): ModelPricingDetails {
  if (!modelId) {
    return makePricingDetails(0.10, 0.40, 0.25, true);
  }
  const clean = modelId.trim().toLowerCase();
  if (clean.endsWith(":free") || clean === "openrouter/free" || clean.endsWith("/free")) {
    return makePricingDetails(0, 0, 0, true);
  }

  // Exact match
  for (const [key, val] of Object.entries(AI_MODEL_STANDARD_PRICES)) {
    if (key.toLowerCase() === clean) {
      return makePricingDetails(val.input, val.output, val.blended);
    }
  }

  // Prefix stripped match (e.g. "openai/gpt-4o" -> "gpt-4o")
  const stripped = clean.replace(/^(openai|google|anthropic|models|deepseek|mistralai|meta-llama|qwen)\//i, "");
  for (const [key, val] of Object.entries(AI_MODEL_STANDARD_PRICES)) {
    if (key.toLowerCase() === stripped || key.toLowerCase().endsWith(`/${stripped}`)) {
      return makePricingDetails(val.input, val.output, val.blended);
    }
  }

  // Heuristics
  if (stripped.includes("pro")) {
    return makePricingDetails(1.25, 5.00, 3.125);
  }
  if (stripped.includes("flash") || stripped.includes("mini") || stripped.includes("lite")) {
    return makePricingDetails(0.10, 0.40, 0.25);
  }
  if (stripped.includes("sonnet") || stripped.includes("gpt-4") || stripped.includes("opus")) {
    return makePricingDetails(3.00, 15.00, 9.00);
  }

  return makePricingDetails(0.15, 0.60, 0.375);
}