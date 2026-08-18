import { env } from "../config.js";
import type { LlmMode, ProviderProfile } from "../types.js";

export interface ProviderPreset {
  id: string;
  label: string;
  mode: LlmMode;
  defaultModel: string;
  defaultBaseUrl?: string;
  requiresCredential: boolean;
  supportsModelDiscovery: boolean;
}

/** Public metadata only. API keys are deliberately absent. */
export const providerCatalog: ProviderPreset[] = [
  { id: "offline-gguf", label: "Bundled offline GGUF", mode: "local-gguf", defaultModel: env.LOCAL_MODEL, defaultBaseUrl: env.LOCAL_OPENAI_BASE_URL, requiresCredential: false, supportsModelDiscovery: false },
  { id: "ollama", label: "Local Ollama", mode: "ollama", defaultModel: env.OLLAMA_MODEL, defaultBaseUrl: env.OLLAMA_BASE_URL, requiresCredential: false, supportsModelDiscovery: true },
  { id: "openai", label: "OpenAI", mode: "openai", defaultModel: env.OPENAI_MODEL, requiresCredential: true, supportsModelDiscovery: true },
  { id: "groq", label: "Groq", mode: "groq", defaultModel: env.GROQ_MODEL, requiresCredential: true, supportsModelDiscovery: true },
  { id: "openrouter", label: "OpenRouter", mode: "openai-compatible", defaultModel: "openai/gpt-4.1-mini", defaultBaseUrl: "https://openrouter.ai/api/v1", requiresCredential: true, supportsModelDiscovery: true },
  { id: "openai-compatible", label: "OpenAI-compatible API", mode: "openai-compatible", defaultModel: "", requiresCredential: true, supportsModelDiscovery: true },
  { id: "anthropic", label: "Anthropic", mode: "anthropic", defaultModel: env.ANTHROPIC_MODEL, requiresCredential: true, supportsModelDiscovery: false },
  { id: "google", label: "Google Gemini", mode: "google", defaultModel: env.GOOGLE_MODEL, requiresCredential: true, supportsModelDiscovery: false }
];

export function findProviderPreset(id: string): ProviderPreset | undefined {
  return providerCatalog.find((preset) => preset.id === id);
}

export function profileFromPreset(preset: ProviderPreset, id: string, model = preset.defaultModel, baseUrl = preset.defaultBaseUrl): Omit<ProviderProfile, "createdAt" | "updatedAt"> {
  return { id, label: preset.label, mode: preset.mode, model, baseUrl, hasCredential: false };
}
