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
      { value: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku ⭐ Recommended (fast & affordable)", free: true },
      { value: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet (balanced)", free: false },
      { value: "claude-3-opus-20240229", label: "Claude 3 Opus (most capable)", free: false },
      { value: "claude-3-haiku-20240307", label: "Claude 3 Haiku (cheapest)", free: true },
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
      { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash ⭐ Recommended (Free Tier)", free: true },
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
      { value: "deepseek/deepseek-v4-flash",            label: "DeepSeek V4 Flash ⭐ Fast & affordable", free: false },
      { value: "anthropic/claude-3.7-sonnet",           label: "Claude 3.7 Sonnet (Hybrid Reasoning)", free: false },
      { value: "anthropic/claude-3.5-sonnet",           label: "Claude 3.5 Sonnet (via OpenRouter)",   free: false },
      { value: "openai/gpt-4o",                         label: "GPT-4o (via OpenRouter)",              free: false },
      { value: "openai/gpt-4o-mini",                    label: "GPT-4o mini (via OpenRouter)",         free: false },
      { value: "openai/o3-mini",                        label: "OpenAI o3-mini (Reasoning)",           free: false },
      { value: "openai/o1",                             label: "OpenAI o1 (Flagship Reasoning)",       free: false },
      { value: "deepseek/deepseek-r1",                  label: "DeepSeek R1 (paid, higher limits)",    free: false },
      { value: "deepseek/deepseek-v3",                  label: "DeepSeek V3 (671B Flagship)",          free: false },
      { value: "google/gemini-2.5-pro",                 label: "Gemini 2.5 Pro (via OpenRouter)",      free: false },
      { value: "google/gemini-pro-1.5",                 label: "Gemini Pro 1.5 (via OpenRouter)",      free: false },
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