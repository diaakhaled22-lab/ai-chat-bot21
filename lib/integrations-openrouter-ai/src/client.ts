import OpenAI from "openai";

let _openrouter: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_openrouter) {
    const apiKey =
      process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY ||
      process.env.OPENROUTER_API_KEY;
    const baseURL =
      process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL ||
      "https://openrouter.ai/api/v1";

    if (!apiKey) {
      throw new Error(
        "OPENROUTER_API_KEY must be set. Please add your OpenRouter API key as a secret.",
      );
    }
    _openrouter = new OpenAI({ apiKey, baseURL });
  }
  return _openrouter;
}

export const openrouter = new Proxy({} as OpenAI, {
  get(_target, prop) {
    const client = getClient();
    const value = (client as any)[prop];
    return typeof value === "function" ? value.bind(client) : value;
  },
});
