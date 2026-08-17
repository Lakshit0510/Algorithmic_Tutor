import type { NextFunction, Request, Response } from "express";
import { logger } from "./logger.js";

export class AppError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export function errorHandler(error: unknown, _request: Request, response: Response, _next: NextFunction) {
  const status = error instanceof AppError ? error.status : 500;
  const message = error instanceof Error ? error.message : "Unexpected server error.";
  if (status >= 500) logger.error({ err: error, path: _request.path }, "Unhandled request error");
  response.status(status).json({ error: message });
}
