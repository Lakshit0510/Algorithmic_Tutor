import { invoke } from "@tauri-apps/api/core";
import type { LlmSettings, ProviderPreset, ProviderProfile, TutorSession } from "./types";

const isDesktop = "__TAURI_INTERNALS__" in window;
type DesktopRuntime = { apiOrigin: string; token: string };
let desktopRuntime: Promise<DesktopRuntime> | undefined;

async function runtime(): Promise<DesktopRuntime | undefined> {
  if (!isDesktop) return undefined;
  desktopRuntime ??= invoke<DesktopRuntime>("desktop_runtime");
  return desktopRuntime;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const localRuntime = await runtime();
  const apiOrigin = localRuntime?.apiOrigin ?? (import.meta.env.VITE_API_ORIGIN ?? "");
  const headers = new Headers(init?.headers);
  headers.set("content-type", "application/json");
  if (localRuntime) headers.set("authorization", `Bearer ${localRuntime.token}`);
  let response: Response | undefined;
  let lastError: unknown;
  // A Tauri sidecar may take a moment to start; retry only connection failures.
  for (let attempt = 0; attempt < (localRuntime ? 8 : 1); attempt += 1) {
    try { response = await fetch(`${apiOrigin}${path}`, { ...init, headers }); break; }
    catch (error) { lastError = error; await new Promise((resolve) => setTimeout(resolve, 180 * (attempt + 1))); }
  }
  if (!response) throw new Error(localRuntime ? "The desktop mentor service did not start. Close the app and try again." : String(lastError ?? "The mentor could not be reached."));
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "The mentor could not complete that request.");
  return body as T;
}

export const api = {
  health: () => call<{ status: string }>("/health"),
  start: (problemUrl: string, llm: LlmSettings | undefined, problemStatement?: string) => call<TutorSession>("/api/sessions", { method: "POST", body: JSON.stringify({ problemUrl, llm, problemStatement: problemStatement?.trim() || undefined, profileId: llm?.profileId }) }),
  get: (id: string) => call<TutorSession>(`/api/sessions/${id}`),
  review: (id: string, pseudocode: string, clientTurnId: string) => call<TutorSession>(`/api/sessions/${id}/review`, { method: "POST", body: JSON.stringify({ pseudocode, clientTurnId }) }),
  providerCatalog: () => call<{ providers: ProviderPreset[] }>("/api/providers/catalog"),
  providerProfiles: () => call<{ profiles: ProviderProfile[] }>("/api/providers/profiles"),
  createProviderProfile: (input: { presetId: string; label?: string; model?: string; baseUrl?: string; mode?: LlmSettings["mode"] }) => call<ProviderProfile>("/api/providers/profiles", { method: "POST", body: JSON.stringify(input) }),
  updateProviderProfile: (id: string, input: { label?: string; model?: string; baseUrl?: string; mode?: LlmSettings["mode"] }) => call<ProviderProfile>(`/api/providers/profiles/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  deleteProviderProfile: (id: string) => call<void>(`/api/providers/profiles/${id}`, { method: "DELETE" }),
  providerModels: (id: string) => call<{ models: string[] }>(`/api/providers/profiles/${id}/models`),
  testProvider: (id: string) => call<{ ok: boolean; model: string }>(`/api/providers/profiles/${id}/test`, { method: "POST" }),
  async saveDesktopSecret(profileId: string, secret: string): Promise<void> {
    if (!isDesktop) throw new Error("Saving API keys in the browser is intentionally disabled. Use the desktop app or configure a server key.");
    await invoke("save_provider_secret", { profileId, secret });
  },
  async deleteDesktopSecret(profileId: string): Promise<void> {
    if (!isDesktop) return;
    await invoke("delete_provider_secret", { profileId });
  },
  async provisionDesktopSecrets(profileIds: string[]): Promise<void> {
    if (!isDesktop || profileIds.length === 0) return;
    await invoke("provision_provider_secrets", { profileIds });
  },
  isDesktop
};
