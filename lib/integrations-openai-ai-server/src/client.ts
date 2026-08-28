import OpenAI from "openai";

let _openai: OpenAI | null = null;

export const openai = new Proxy({} as OpenAI, {
  get(_target, prop) {
    if (!_openai) {
      const apiKey =
        process.env.AI_INTEGRATIONS_OPENAI_API_KEY ||
        process.env.OPENAI_API_KEY;
      const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
      if (!apiKey) {
        throw new Error(
          "OPENAI_API_KEY must be set. Please add your OpenAI API key as a secret.",
        );
      }
      _openai = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
    }
    const value = (_openai as any)[prop];
    return typeof value === "function" ? value.bind(_openai) : value;
  },
});
