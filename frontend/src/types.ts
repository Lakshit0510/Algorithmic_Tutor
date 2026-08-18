export type LlmMode = "local-gguf" | "ollama" | "groq" | "openai" | "openai-compatible" | "anthropic" | "google";

export interface LlmSettings {
  mode: LlmMode;
  profileId?: string;
  baseUrl?: string;
  model?: string;
}

export interface ProviderPreset {
  id: string;
  label: string;
  mode: LlmMode;
  defaultModel: string;
  defaultBaseUrl?: string;
  requiresCredential: boolean;
  supportsModelDiscovery: boolean;
}

export interface ProviderProfile {
  id: string;
  label: string;
  mode: LlmMode;
  model: string;
  baseUrl?: string;
  hasCredential: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ReviewVerdict = "solved" | "keep_iterating";

export interface TutorTurn {
  id: string;
  learnerMessage: string;
  mentorMessage: string;
  verdict: ReviewVerdict;
  createdAt: string;
}

export interface ProblemData {
  title: string; url: string; statement: string; statementSource: "codeforces" | "user-pasted"; constraints: string; tags: string[];
  difficulty: number | null; timeLimit: string; memoryLimit: string;
}

export interface TutorState {
  problemUrl: string; problemData: ProblemData; requiredPattern: string; strategy: string;
  userPseudocode?: string; feedbackHistory?: string[]; turns: TutorTurn[]; feedback?: string; isSolved: boolean; llm: LlmSettings;
}

export interface TutorSession { id: string; state: TutorState; createdAt: string; updatedAt: string }
