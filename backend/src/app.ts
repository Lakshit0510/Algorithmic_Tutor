import cors from "cors";
import express from "express";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Express, NextFunction, Request, Response } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { ZodError } from "zod";
import { env } from "./config.js";
import { AppError, errorHandler } from "./lib/errors.js";
import { logger } from "./lib/logger.js";
import { createTutorRouter } from "./routes/tutor.js";
import { SessionStore } from "./services/sessionStore.js";

export function createApp(store = new SessionStore()): Express {
  const app = express();
  const configuredOrigins = env.CORS_ORIGIN.split(",").map((value) => value.trim());
  const shouldUpgradeInsecureRequests = configuredOrigins.every((origin) => origin.startsWith("https://"));
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use((request, response, next) => {
    const suppliedId = request.headers["x-request-id"];
    const requestId = typeof suppliedId === "string" && suppliedId.length <= 128 ? suppliedId : randomUUID();
    const startedAt = performance.now();
    response.setHeader("x-request-id", requestId);
    response.on("finish", () => {
      const event = { requestId, method: request.method, path: request.path, statusCode: response.statusCode, durationMs: Math.round(performance.now() - startedAt) };
      if (response.statusCode >= 500) logger.error(event, "HTTP request completed");
      else if (response.statusCode >= 400) logger.warn(event, "HTTP request completed");
      else logger.info(event, "HTTP request completed");
    });
    next();
  });
  app.use(helmet({
    contentSecurityPolicy: env.SERVE_STATIC ? {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        connectSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        ...(shouldUpgradeInsecureRequests ? { upgradeInsecureRequests: [] } : {})
      }
    } : false
  }));
  app.use(cors({ origin: configuredOrigins }));
  app.use(express.json({ limit: "256kb" }));
  app.use("/api", rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
    limit: env.RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (request, response) => {
      logger.warn({ requestId: response.getHeader("x-request-id"), route: request.path }, "API rate limit reached");
      response.status(429).json({ error: "Too many requests. Please wait before trying again." });
    }
  }));
  app.get("/health", (_request, response) => response.json({ status: "ok" }));
  app.use("/api", createTutorRouter(store));
  const cleanupInterval = setInterval(() => store.cleanup(), Math.min(env.SESSION_TTL_MINUTES * 60 * 1000, 15 * 60 * 1000));
  cleanupInterval.unref();
  if (env.SERVE_STATIC) {
    const staticDir = resolve(env.STATIC_DIR);
    if (existsSync(staticDir)) {
      app.use(express.static(staticDir, {
        index: "index.html",
        maxAge: "1h",
        setHeaders: (response, filePath) => {
          if (filePath.endsWith("index.html")) response.setHeader("Cache-Control", "no-cache");
        }
      }));
      app.get("*", (_request, response) => response.sendFile(resolve(staticDir, "index.html")));
    } else {
      logger.warn({ staticDir }, "Configured static directory does not exist");
    }
  }
  app.use((_request, _response, next) => next(new AppError(404, "Route not found.")));
  app.use((error: unknown, request: Request, response: Response, next: NextFunction) => {
    if (error instanceof ZodError) return response.status(400).json({ error: error.issues[0]?.message ?? "Invalid request." });
    return errorHandler(error, request, response, next);
  });
  return app;
}
