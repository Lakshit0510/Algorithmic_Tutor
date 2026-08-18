export type LlmMode = "local-gguf" | "ollama" | "groq" | "openai" | "openai-compatible" | "anthropic" | "google";

export interface LlmSettings {
  mode: LlmMode;
  /** A non-secret saved profile identifier. API keys never belong here. */
  profileId?: string;
  baseUrl?: string;
  model?: string;
}

export interface ProviderProfile {
  id: string;
  label: string;
  mode: LlmMode;
  model: string;
  baseUrl?: string;
  /** Only a boolean is returned to the UI; the key stays in the desktop vault. */
  hasCredential: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ReviewVerdict = "solved" | "keep_iterating";

/** A learner approach and its mentor response are intentionally stored together. */
export interface TutorTurn {
  id: string;
  learnerMessage: string;
  mentorMessage: string;
  verdict: ReviewVerdict;
  createdAt: string;
}

export interface ProblemData {
  contestId: number;
  index: string;
  title: string;
  url: string;
  statement: string;
  statementSource: "codeforces" | "user-pasted";
  constraints: string;
  tags: string[];
  difficulty: number | null;
  timeLimit: string;
  memoryLimit: string;
}

export interface TutorState {
  problemUrl: string;
  problemData?: ProblemData;
  requiredPattern?: string;
  strategy?: string;
  userPseudocode?: string;
  /** Legacy sessions can still contain this field until their TTL expires. */
  feedbackHistory?: string[];
  turns: TutorTurn[];
  feedback?: string;
  isSolved: boolean;
  llm: LlmSettings;
}

export interface TutorSession {
  id: string;
  state: TutorState;
  createdAt: string;
  updatedAt: string;
}
