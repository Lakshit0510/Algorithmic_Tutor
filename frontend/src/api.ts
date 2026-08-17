import type { LlmSettings, TutorSession } from "./types";

// Vite proxies API calls in a browser. A packaged Tauri webview has no proxy, so
// it speaks to the loopback sidecar directly.
const apiOrigin = "__TAURI_INTERNALS__" in window ? "http://127.0.0.1:8787" : (import.meta.env.VITE_API_ORIGIN ?? "");

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiOrigin}${path}`, { headers: { "content-type": "application/json" }, ...init });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "The mentor could not complete that request.");
  return body as T;
}

export const api = {
  start: (problemUrl: string, llm: LlmSettings, problemStatement?: string) => call<TutorSession>("/api/sessions", { method: "POST", body: JSON.stringify({ problemUrl, llm, problemStatement: problemStatement?.trim() || undefined }) }),
  get: (id: string) => call<TutorSession>(`/api/sessions/${id}`),
  review: (id: string, pseudocode: string) => call<TutorSession>(`/api/sessions/${id}/review`, { method: "POST", body: JSON.stringify({ pseudocode }) })
};
