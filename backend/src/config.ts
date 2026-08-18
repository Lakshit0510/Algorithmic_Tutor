import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_MODE: z.enum(["local", "cloud", "desktop"]).default("local"),
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().positive().default(8787),
  CORS_ORIGIN: z.string().default("http://localhost:5173,http://tauri.localhost,tauri://localhost"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().positive().max(60).default(15),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().max(1000).default(60),
  SESSION_CREATE_LIMIT: z.coerce.number().int().positive().max(100).default(10),
  SESSION_REVIEW_LIMIT: z.coerce.number().int().positive().max(500).default(40),
  SESSION_DB_PATH: z.string().default("data/tutor-sessions.db"),
  SESSION_TTL_MINUTES: z.coerce.number().int().positive().max(1440).default(120),
  MAX_PROMPT_CHARS: z.coerce.number().int().positive().max(100000).default(20000),
  SERVE_STATIC: z.enum(["true", "false"]).transform((value) => value === "true").default("false"),
  STATIC_DIR: z.string().default("public"),
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().default("llama-3.3-70b-versatile"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-5.4"),
  OPENAI_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().max(4000).default(800),
  // Conservative global guardrails for a 10 RPM / 50 RPD development quota.
  OPENAI_GLOBAL_RPM: z.coerce.number().int().positive().max(10).default(4),
  OPENAI_DAILY_REQUEST_LIMIT: z.coerce.number().int().positive().max(50).default(30),
  LOCAL_OPENAI_BASE_URL: z.string().url().default("http://127.0.0.1:8080/v1"),
  LOCAL_MODEL: z.string().default("qwen2.5-1.5b-instruct-q4_k_m.gguf"),
  OLLAMA_BASE_URL: z.string().url().default("http://127.0.0.1:11434"),
  OLLAMA_MODEL: z.string().default("qwen2.5:1.5b"),
  OPENAI_COMPATIBLE_BASE_URL: z.string().url().optional(),
  OPENAI_COMPATIBLE_MODEL: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-3-5-haiku-latest"),
  GOOGLE_API_KEY: z.string().optional(),
  GOOGLE_MODEL: z.string().default("gemini-2.0-flash"),
  DESKTOP_RUNTIME_TOKEN: z.string().min(32).optional(),
  LLM_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().max(180000).default(60000),
  LLM_PROVIDER: z.enum(["local-gguf", "ollama", "groq", "openai", "openai-compatible", "anthropic", "google"]).default("local-gguf")
});

export const env = envSchema.parse(process.env);
