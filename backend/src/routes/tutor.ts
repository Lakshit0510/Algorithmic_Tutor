import { Router } from "express";
import type { RequestHandler, Router as ExpressRouter } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { env } from "../config.js";
import { logger } from "../lib/logger.js";
import { AppError } from "../lib/errors.js";
import { createTutorState, reviewTutorState } from "../graph/tutorGraph.js";
import { normalizeLlmSettings } from "../llm/llmFactory.js";
import { SessionStore } from "../services/sessionStore.js";

const llmSchema = z.object({
  mode: z.enum(["local-gguf", "ollama", "groq", "openai", "openai-compatible", "anthropic", "google"]).optional(),
  profileId: z.string().uuid().optional(),
  baseUrl: z.string().url().optional(),
  model: z.string().min(1).max(120).optional()
}).optional();
const problemSchema = z.object({
  problemUrl: z.string().url(),
  problemStatement: z.string().trim().min(50, "Paste at least 50 characters of the problem statement.").max(20000).optional(),
  profileId: z.string().uuid().optional(),
  llm: llmSchema
});
const reviewSchema = z.object({ clientTurnId: z.string().uuid(), pseudocode: z.string().trim().min(20, "Describe at least a few steps of your approach.").max(8000) });

export function createTutorRouter(store = new SessionStore()): ExpressRouter {
  const router = Router();
  const createLimiter = rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
    limit: env.SESSION_CREATE_LIMIT,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (request, response) => {
      logger.warn({ requestId: response.getHeader("x-request-id"), route: request.path }, "Session creation rate limit reached");
      response.status(429).json({ error: "Too many new tutoring sessions. Please wait before starting another problem." });
    }
  });
  const reviewLimiter = rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
    limit: env.SESSION_REVIEW_LIMIT,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (request, response) => {
      logger.warn({ requestId: response.getHeader("x-request-id"), route: request.path }, "Pseudocode review rate limit reached");
      response.status(429).json({ error: "Too many review requests. Please wait before submitting another approach." });
    }
  });
  const useOpenAiQuota = env.APP_MODE === "cloud" && env.LLM_PROVIDER === "openai";
  const openAiMinuteQuota: RequestHandler = (_request, response, next) => {
    if (!useOpenAiQuota || store.consumeQuota("openai-model-minute", env.OPENAI_GLOBAL_RPM, 60 * 1000)) return next();
    response.status(429).json({ error: "The shared OpenAI request budget is temporarily full. Please retry in a minute." });
  };
  const openAiDailyQuota: RequestHandler = (_request, response, next) => {
    if (!useOpenAiQuota || store.consumeQuota("openai-model-day", env.OPENAI_DAILY_REQUEST_LIMIT, 24 * 60 * 60 * 1000)) return next();
    response.status(429).json({ error: "The shared OpenAI daily request budget is exhausted. Please try again tomorrow." });
  };

  router.post("/sessions", createLimiter, openAiMinuteQuota, openAiDailyQuota, async (request, response, next) => {
    try {
      const body = problemSchema.parse(request.body);
      if (env.APP_MODE === "cloud" && (body.profileId || body.llm)) throw new AppError(400, "The public deployment uses its server-configured mentor.");
      const profile = body.profileId ? store.getProviderProfile(body.profileId) : undefined;
      if (body.profileId && !profile) throw new AppError(404, "Provider profile not found.");
      const llm = profile
        ? normalizeLlmSettings({ mode: profile.mode, model: profile.model, baseUrl: profile.baseUrl, profileId: profile.id })
        : normalizeLlmSettings(body.llm);
      const state = await createTutorState(body.problemUrl, llm, body.problemStatement);
      response.status(201).json(store.create(state));
    } catch (error) { next(error); }
  });

  router.get("/sessions/:id", (request, response, next) => {
    try {
      const sessionId = Array.isArray(request.params.id) ? request.params.id[0] : request.params.id;
      const session = sessionId ? store.get(sessionId) : undefined;
      if (!session) throw new AppError(404, "Tutoring session not found. Start a new problem.");
      response.json(session);
    } catch (error) { next(error); }
  });

  router.post("/sessions/:id/review", reviewLimiter, openAiMinuteQuota, openAiDailyQuota, async (request, response, next) => {
    try {
      const body = reviewSchema.parse(request.body);
      const sessionId = Array.isArray(request.params.id) ? request.params.id[0] : request.params.id;
      const current = sessionId ? store.get(sessionId) : undefined;
      if (!current) throw new AppError(404, "Tutoring session not found. Start a new problem.");
      if (current.state.isSolved) throw new AppError(409, "This session is already complete. Start another challenge when ready.");
      const existingTurn = current.state.turns?.find((turn) => turn.id === body.clientTurnId);
      if (existingTurn) return response.json(current);
      const state = await reviewTutorState(current.state, body.pseudocode, body.clientTurnId);
      response.json(store.update(current.id, state));
    } catch (error) { next(error); }
  });
  return router;
}
