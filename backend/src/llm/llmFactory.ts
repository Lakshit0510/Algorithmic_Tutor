import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import { ChatGroq } from "@langchain/groq";
import { ChatOllama } from "@langchain/ollama";
import { ChatOpenAI } from "@langchain/openai";
import { env } from "../config.js";
import { AppError } from "../lib/errors.js";
import { runtimeCredentialStore } from "../services/runtimeCredentialStore.js";
import type { LlmMode, LlmSettings } from "../types.js";
import { providerError } from "./providerErrors.js";

export interface TutorChatModel {
  invoke(messages: BaseMessage[]): Promise<AIMessage>;
}

function isLoopback(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function assertSafeProviderUrl(value: string | undefined, mode: LlmMode): string | undefined {
  if (!value) return value;
  const url = new URL(value);
  if (url.username || url.password) throw new AppError(400, "Provider URLs cannot contain a username or password.");
  if (url.protocol === "https:") return url.toString().replace(/\/$/, "");
  if (url.protocol === "http:" && isLoopback(url.hostname) && ["ollama", "local-gguf", "openai-compatible"].includes(mode)) return url.toString().replace(/\/$/, "");
  throw new AppError(400, "Remote AI providers must use HTTPS. HTTP is allowed only for loopback local engines.");
}

function cloudDefaults(): LlmSettings {
  switch (env.LLM_PROVIDER) {
    case "openai": return { mode: "openai", model: env.OPENAI_MODEL };
    case "groq": return { mode: "groq", model: env.GROQ_MODEL };
    case "anthropic": return { mode: "anthropic", model: env.ANTHROPIC_MODEL };
    case "google": return { mode: "google", model: env.GOOGLE_MODEL };
    case "openai-compatible": return { mode: "openai-compatible", model: env.OPENAI_COMPATIBLE_MODEL, baseUrl: env.OPENAI_COMPATIBLE_BASE_URL };
    case "ollama": return { mode: "ollama", model: env.OLLAMA_MODEL, baseUrl: env.OLLAMA_BASE_URL };
    default: return { mode: "local-gguf", model: env.LOCAL_MODEL, baseUrl: env.LOCAL_OPENAI_BASE_URL };
  }
}

export function normalizeLlmSettings(input?: Partial<LlmSettings>): LlmSettings {
  // Public deployments only accept the server-selected provider. Browser-supplied
  // endpoints are not permitted because they could become an SSRF primitive.
  if (env.APP_MODE === "cloud") return cloudDefaults();
  const mode = input?.mode ?? env.LLM_PROVIDER;
  const settings: LlmSettings = { mode, profileId: input?.profileId, model: input?.model, baseUrl: input?.baseUrl };
  if (!settings.model) {
    settings.model = mode === "openai" ? env.OPENAI_MODEL
      : mode === "groq" ? env.GROQ_MODEL
        : mode === "anthropic" ? env.ANTHROPIC_MODEL
          : mode === "google" ? env.GOOGLE_MODEL
            : mode === "ollama" ? env.OLLAMA_MODEL
              : mode === "openai-compatible" ? env.OPENAI_COMPATIBLE_MODEL
                : env.LOCAL_MODEL;
  }
  if (!settings.baseUrl) {
    settings.baseUrl = mode === "ollama" ? env.OLLAMA_BASE_URL
      : mode === "openai-compatible" ? env.OPENAI_COMPATIBLE_BASE_URL
        : mode === "local-gguf" ? env.LOCAL_OPENAI_BASE_URL
          : undefined;
  }
  settings.baseUrl = assertSafeProviderUrl(settings.baseUrl, mode);
  return settings;
}

function secretFor(settings: LlmSettings): string | undefined {
  const runtimeSecret = runtimeCredentialStore.get(settings.profileId);
  if (runtimeSecret) return runtimeSecret;
  switch (settings.mode) {
    case "openai": return env.OPENAI_API_KEY;
    case "groq": return env.GROQ_API_KEY;
    case "anthropic": return env.ANTHROPIC_API_KEY;
    case "google": return env.GOOGLE_API_KEY;
    default: return undefined;
  }
}

function requireSecret(settings: LlmSettings): string {
  const secret = secretFor(settings);
  if (!secret) throw new AppError(503, `${settings.mode === "openai-compatible" ? "This provider" : settings.mode} is not configured. Save an API key in Mentor settings.`);
  return secret;
}

function asText(message: BaseMessage): string {
  return typeof message.content === "string" ? message.content : JSON.stringify(message.content);
}

function anthropicModel(settings: LlmSettings, key: string): TutorChatModel {
  return {
    async invoke(messages) {
      const system = messages.filter((message) => message.getType() === "system").map(asText).join("\n\n");
      const body = {
        model: settings.model,
        max_tokens: env.OPENAI_MAX_OUTPUT_TOKENS,
        system,
        messages: messages.filter((message) => message.getType() !== "system").map((message) => ({ role: message.getType() === "ai" ? "assistant" : "user", content: asText(message) }))
      };
      try {
        const response = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", signal: AbortSignal.timeout(env.LLM_REQUEST_TIMEOUT_MS), headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" }, body: JSON.stringify(body) });
        if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
        const data = await response.json() as { content?: Array<{ type?: string; text?: string }> };
        return new AIMessage(data.content?.filter((part) => part.type === "text").map((part) => part.text ?? "").join("") ?? "");
      } catch (error) { throw providerError(error); }
    }
  };
}

function googleModel(settings: LlmSettings, key: string): TutorChatModel {
  return {
    async invoke(messages) {
      const systemInstruction = messages.filter((message) => message.getType() === "system").map(asText).join("\n\n");
      const contents = messages.filter((message) => message.getType() !== "system").map((message) => ({ role: message.getType() === "ai" ? "model" : "user", parts: [{ text: asText(message) }] }));
      try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(settings.model ?? env.GOOGLE_MODEL)}:generateContent?key=${encodeURIComponent(key)}`;
        const response = await fetch(endpoint, { method: "POST", signal: AbortSignal.timeout(env.LLM_REQUEST_TIMEOUT_MS), headers: { "content-type": "application/json" }, body: JSON.stringify({ systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined, contents, generationConfig: { temperature: 0.2, maxOutputTokens: env.OPENAI_MAX_OUTPUT_TOKENS } }) });
        if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
        const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
        return new AIMessage(data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "");
      } catch (error) { throw providerError(error); }
    }
  };
}

export function getLLM(settings: LlmSettings): TutorChatModel {
  try {
    if (settings.mode === "groq") return new ChatGroq({ apiKey: requireSecret(settings), model: settings.model ?? env.GROQ_MODEL, temperature: 0.2 });
    if (settings.mode === "openai") return new ChatOpenAI({ apiKey: requireSecret(settings), model: settings.model ?? env.OPENAI_MODEL, maxTokens: env.OPENAI_MAX_OUTPUT_TOKENS, temperature: 0.2 });
    if (settings.mode === "openai-compatible") return new ChatOpenAI({ apiKey: requireSecret(settings), configuration: { baseURL: assertSafeProviderUrl(settings.baseUrl, settings.mode) }, model: settings.model, maxTokens: env.OPENAI_MAX_OUTPUT_TOKENS, temperature: 0.2 });
    if (settings.mode === "ollama") return new ChatOllama({ baseUrl: assertSafeProviderUrl(settings.baseUrl, settings.mode), model: settings.model, temperature: 0.2 });
    if (settings.mode === "anthropic") return anthropicModel(settings, requireSecret(settings));
    if (settings.mode === "google") return googleModel(settings, requireSecret(settings));
    return new ChatOpenAI({ apiKey: "local-llama-server", configuration: { baseURL: assertSafeProviderUrl(settings.baseUrl, settings.mode) }, model: settings.model, temperature: 0.2 });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw providerError(error);
  }
}
