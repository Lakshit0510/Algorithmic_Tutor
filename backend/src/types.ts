export type LlmMode = "local-gguf" | "ollama" | "groq" | "openai";

export interface LlmSettings {
  mode: LlmMode;
  baseUrl?: string;
  model?: string;
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
  feedbackHistory: string[];
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
