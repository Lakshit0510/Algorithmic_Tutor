import { AppError } from "../lib/errors.js";

/** Converts vendor-specific exceptions into messages safe for the learner UI. */
export function providerError(error: unknown): AppError {
  const message = error instanceof Error ? error.message : String(error);
  if (/401|403|invalid.*(api)?\s*key|authentication|unauthori[sz]ed/i.test(message)) return new AppError(401, "The provider rejected this API key. Save a valid key and test the connection again.");
  if (/429|rate limit|quota|billing/i.test(message)) return new AppError(429, "The provider's request limit or quota has been reached. Please wait or use another profile.");
  if (/model.*not found|not found.*model/i.test(message)) return new AppError(400, "That model is unavailable for the selected provider. Refresh models or enter a valid model ID.");
  if (/ECONNREFUSED|fetch failed|network|timeout|abort/i.test(message)) return new AppError(503, "The provider could not be reached. Check Ollama, your network, and the configured endpoint.");
  return new AppError(502, "The selected AI provider could not complete this request.");
}
