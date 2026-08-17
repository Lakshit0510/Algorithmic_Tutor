import pino from "pino";
import { env } from "../config.js";

export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: "algorithmic-tutor-api", environment: env.NODE_ENV },
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.body",
      "GROQ_API_KEY"
    ],
    remove: true
  }
});
