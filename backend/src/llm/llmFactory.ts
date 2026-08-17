import { ChatGroq } from "@langchain/groq";
import { ChatOllama } from "@langchain/ollama";
import { ChatOpenAI } from "@langchain/openai";
import { env } from "../config.js";
import { AppError } from "../lib/errors.js";
import type { LlmSettings } from "../types.js";

export function normalizeLlmSettings(input?: Partial<LlmSettings>): LlmSettings {
  // A public deployment must never use browser-supplied base URLs: they could be
  // abused to make the server call private network addresses.
  if (env.APP_MODE === "cloud") {
    return env.LLM_PROVIDER === "openai"
      ? { mode: "openai", model: env.OPENAI_MODEL }
      : { mode: "groq", model: env.GROQ_MODEL };
  }
  const mode = input?.mode ?? env.LLM_PROVIDER;
  if (mode === "openai") return { mode, model: env.OPENAI_MODEL };
  if (mode === "groq") return { mode, model: input?.model ?? env.GROQ_MODEL };
  if (mode === "ollama") return { mode, baseUrl: input?.baseUrl ?? env.OLLAMA_BASE_URL, model: input?.model ?? env.OLLAMA_MODEL };
  return { mode: "local-gguf", baseUrl: input?.baseUrl ?? env.LOCAL_OPENAI_BASE_URL, model: input?.model ?? env.LOCAL_MODEL };
}

export function getLLM(settings: LlmSettings) {
  if (settings.mode === "groq") {
    if (!env.GROQ_API_KEY) throw new AppError(503, "Cloud mentor is not configured. Set GROQ_API_KEY on the backend.");
    return new ChatGroq({ apiKey: env.GROQ_API_KEY, model: settings.model ?? env.GROQ_MODEL, temperature: 0.2 });
  }
  if (settings.mode === "openai") {
    if (!env.OPENAI_API_KEY) throw new AppError(503, "OpenAI mentor is not configured. Set OPENAI_API_KEY on the backend.");
    return new ChatOpenAI({
      apiKey: env.OPENAI_API_KEY,
      model: settings.model ?? env.OPENAI_MODEL,
      maxTokens: env.OPENAI_MAX_OUTPUT_TOKENS
    });
  }
  if (settings.mode === "ollama") {
    return new ChatOllama({ baseUrl: settings.baseUrl, model: settings.model, temperature: 0.2 });
  }
  return new ChatOpenAI({
    apiKey: "local-llama-server",
    configuration: { baseURL: settings.baseUrl },
    model: settings.model,
    temperature: 0.2
  });
}
