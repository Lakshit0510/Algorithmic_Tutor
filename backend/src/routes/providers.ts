import { randomUUID } from "node:crypto";
import { HumanMessage } from "@langchain/core/messages";
import { Router } from "express";
import type { Router as ExpressRouter } from "express";
import { z } from "zod";
import { env } from "../config.js";
import { AppError } from "../lib/errors.js";
import { assertSafeProviderUrl, getLLM, normalizeLlmSettings } from "../llm/llmFactory.js";
import { findProviderPreset, profileFromPreset, providerCatalog } from "../llm/providerCatalog.js";
import { runtimeCredentialStore } from "../services/runtimeCredentialStore.js";
import { SessionStore } from "../services/sessionStore.js";
import type { LlmMode, ProviderProfile } from "../types.js";

const modes = ["local-gguf", "ollama", "groq", "openai", "openai-compatible", "anthropic", "google"] as const;
const profileSchema = z.object({
  presetId: z.string().min(1).max(80),
  label: z.string().trim().min(1).max(80).optional(),
  model: z.string().trim().min(1).max(160).optional(),
  baseUrl: z.string().url().max(500).optional(),
  // Only accepted for the Advanced preset. Known presets keep their adapter fixed.
  mode: z.enum(modes).optional()
});

function desktopToken(request: { headers: Record<string, string | string[] | undefined> }): string | undefined {
  const header = request.headers.authorization;
  const value = Array.isArray(header) ? header[0] : header;
  return value?.match(/^Bearer\s+(.+)$/i)?.[1];
}

function requireDesktopToken(request: { headers: Record<string, string | string[] | undefined> }): void {
  if (env.APP_MODE !== "desktop" || !env.DESKTOP_RUNTIME_TOKEN || desktopToken(request) !== env.DESKTOP_RUNTIME_TOKEN) {
    throw new AppError(404, "Route not found.");
  }
}

function profileWithCredentialStatus(profile: ProviderProfile): ProviderProfile {
  return { ...profile, hasCredential: profile.mode === "ollama" || profile.mode === "local-gguf" ? false : runtimeCredentialStore.has(profile.id) };
}

function toSettings(profile: ProviderProfile) {
  return normalizeLlmSettings({ mode: profile.mode, model: profile.model, baseUrl: profile.baseUrl, profileId: profile.id });
}

function remoteModelsEndpoint(settings: ReturnType<typeof normalizeLlmSettings>): string | undefined {
  if (settings.mode === "openai") return "https://api.openai.com/v1/models";
  if (settings.mode === "groq") return "https://api.groq.com/openai/v1/models";
  if (settings.mode === "openai-compatible" && settings.baseUrl) return `${settings.baseUrl.replace(/\/$/, "")}/models`;
  return undefined;
}

async function listModels(profile: ProviderProfile): Promise<string[]> {
  const settings = toSettings(profile);
  if (settings.mode === "ollama") {
    const response = await fetch(`${settings.baseUrl?.replace(/\/$/, "")}/api/tags`, { signal: AbortSignal.timeout(env.LLM_REQUEST_TIMEOUT_MS) });
    if (!response.ok) throw new AppError(503, "Ollama is running but its model list could not be read.");
    const data = await response.json() as { models?: Array<{ name?: string }> };
    return (data.models ?? []).map((model) => model.name).filter((name): name is string => Boolean(name));
  }
  const endpoint = remoteModelsEndpoint(settings);
  if (!endpoint) return [];
  const secret = runtimeCredentialStore.get(profile.id);
  if (!secret) throw new AppError(400, "Save this profile's API key before loading models.");
  const response = await fetch(endpoint, { headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(env.LLM_REQUEST_TIMEOUT_MS) });
  if (!response.ok) throw new AppError(response.status === 401 ? 401 : 503, "The provider's model list could not be loaded. Check the API key and endpoint.");
  const data = await response.json() as { data?: Array<{ id?: string }> };
  return (data.data ?? []).map((model) => model.id).filter((id): id is string => Boolean(id)).sort();
}

function makeProfile(input: z.infer<typeof profileSchema>, id: string): Omit<ProviderProfile, "createdAt" | "updatedAt"> {
  const preset = findProviderPreset(input.presetId);
  if (!preset) throw new AppError(400, "Choose a supported provider preset.");
  const mode: LlmMode = input.presetId === "openai-compatible" ? (input.mode ?? "openai-compatible") : preset.mode;
  const baseUrl = assertSafeProviderUrl(input.baseUrl ?? preset.defaultBaseUrl, mode);
  const model = input.model ?? preset.defaultModel;
  if (!model) throw new AppError(400, "Enter a model ID for this provider.");
  return { ...profileFromPreset({ ...preset, mode }, id, model, baseUrl), label: input.label ?? preset.label, mode };
}

export function createProviderRouter(store = new SessionStore()): ExpressRouter {
  const router = Router();
  router.get("/providers/catalog", (_request, response) => response.json({ providers: providerCatalog }));

  router.get("/providers/profiles", (_request, response) => {
    if (env.APP_MODE === "cloud") return response.json({ profiles: [] });
    response.json({ profiles: store.listProviderProfiles().map(profileWithCredentialStatus) });
  });

  router.post("/providers/profiles", (request, response, next) => {
    try {
      if (env.APP_MODE === "cloud") throw new AppError(403, "Provider profiles are managed by the server on the public deployment.");
      const input = profileSchema.parse(request.body);
      response.status(201).json(profileWithCredentialStatus(store.upsertProviderProfile(makeProfile(input, randomUUID()))));
    } catch (error) { next(error); }
  });

  router.patch("/providers/profiles/:id", (request, response, next) => {
    try {
      if (env.APP_MODE === "cloud") throw new AppError(403, "Provider profiles are managed by the server on the public deployment.");
      const id = Array.isArray(request.params.id) ? request.params.id[0] : request.params.id;
      const existing = id ? store.getProviderProfile(id) : undefined;
      if (!existing) throw new AppError(404, "Provider profile not found.");
      const input = profileSchema.partial().parse(request.body);
      const mode = input.mode ?? existing.mode;
      const model = input.model ?? existing.model;
      const baseUrl = assertSafeProviderUrl(input.baseUrl ?? existing.baseUrl, mode);
      const updated = store.upsertProviderProfile({ ...existing, label: input.label ?? existing.label, mode, model, baseUrl, hasCredential: runtimeCredentialStore.has(existing.id), id: existing.id });
      response.json(profileWithCredentialStatus(updated));
    } catch (error) { next(error); }
  });

  router.delete("/providers/profiles/:id", (request, response, next) => {
    try {
      if (env.APP_MODE === "cloud") throw new AppError(403, "Provider profiles are managed by the server on the public deployment.");
      const id = Array.isArray(request.params.id) ? request.params.id[0] : request.params.id;
      if (!id || !store.deleteProviderProfile(id)) throw new AppError(404, "Provider profile not found.");
      runtimeCredentialStore.delete(id);
      response.status(204).end();
    } catch (error) { next(error); }
  });

  router.get("/providers/profiles/:id/models", async (request, response, next) => {
    try {
      const id = Array.isArray(request.params.id) ? request.params.id[0] : request.params.id;
      const profile = id ? store.getProviderProfile(id) : undefined;
      if (!profile) throw new AppError(404, "Provider profile not found.");
      response.json({ models: await listModels(profile) });
    } catch (error) { next(error); }
  });

  router.post("/providers/profiles/:id/test", async (request, response, next) => {
    try {
      const id = Array.isArray(request.params.id) ? request.params.id[0] : request.params.id;
      const profile = id ? store.getProviderProfile(id) : undefined;
      if (!profile) throw new AppError(404, "Provider profile not found.");
      const result = await getLLM(toSettings(profile)).invoke([new HumanMessage("Reply exactly with OK.")]);
      response.json({ ok: Boolean(result.content), model: profile.model });
    } catch (error) { next(error); }
  });

  // This route only exists for a packaged desktop process. The random per-launch
  // token is injected by Tauri and never persisted in browser storage.
  router.put("/desktop/credentials/:profileId", (request, response, next) => {
    try {
      requireDesktopToken(request);
      const profileId = Array.isArray(request.params.profileId) ? request.params.profileId[0] : request.params.profileId;
      const secret = z.object({ secret: z.string().min(1).max(10000) }).parse(request.body).secret;
      if (!profileId || !store.getProviderProfile(profileId)) throw new AppError(404, "Provider profile not found.");
      runtimeCredentialStore.set(profileId, secret);
      response.status(204).end();
    } catch (error) { next(error); }
  });

  router.delete("/desktop/credentials/:profileId", (request, response, next) => {
    try {
      requireDesktopToken(request);
      const profileId = Array.isArray(request.params.profileId) ? request.params.profileId[0] : request.params.profileId;
      if (!profileId) throw new AppError(404, "Provider profile not found.");
      runtimeCredentialStore.delete(profileId);
      response.status(204).end();
    } catch (error) { next(error); }
  });
  return router;
}
