import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { z } from "zod";
import { getLLM } from "../llm/llmFactory.js";
import { env } from "../config.js";
import { fetchProblemData } from "../services/codeforces.js";
import type { TutorState } from "../types.js";

const MentorState = Annotation.Root({
  problemUrl: Annotation<string>,
  suppliedStatement: Annotation<string>,
  problemData: Annotation<TutorState["problemData"]>,
  requiredPattern: Annotation<string>,
  strategy: Annotation<string>,
  userPseudocode: Annotation<string>,
  turns: Annotation<TutorState["turns"]>({ reducer: (_oldValue, nextValue) => nextValue, default: () => [] }),
  feedback: Annotation<string>,
  isSolved: Annotation<boolean>,
  llm: Annotation<TutorState["llm"]>
});

const guardrail = `You are a rigorous algorithmic mentor for placement readiness and competitive programming.
Never write source code, full pseudocode, a line-by-line algorithm, or a complete solution.
Teach the mental model, correctness conditions, complexity bounds, invariants, edge cases, and next smallest improvement.
Do not claim a solution is correct unless its stated logic handles every requirement and meets the expected complexity.
Be concise, precise, and encouraging.`;

function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((part) => typeof part === "string" ? part : "text" in part ? String(part.text) : "").join("");
  return String(content);
}

function boundedStatement(statement: string): string {
  if (statement.length <= env.MAX_PROMPT_CHARS) return statement;
  return `${statement.slice(0, env.MAX_PROMPT_CHARS)}\n\n[Statement truncated to respect the configured request budget.]`;
}

function boundedPreviousTurns(turns: TutorState["turns"]): string {
  const recent = turns.slice(-4).map((turn) => `Learner: ${turn.learnerMessage}\nMentor: ${turn.mentorMessage}`).join("\n\n");
  return recent.length <= 6000 ? recent : recent.slice(-6000);
}

const reviewResponseSchema = z.object({
  verdict: z.enum(["solved", "keep_iterating"]),
  feedback: z.string().min(1).max(5000)
});

function jsonCandidate(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start >= 0 && end > start ? text.slice(start, end + 1) : text;
}

async function structuredReview(llm: ReturnType<typeof getLLM>, rawText: string): Promise<z.infer<typeof reviewResponseSchema>> {
  let initial: z.SafeParseReturnType<unknown, z.infer<typeof reviewResponseSchema>>;
  try { initial = reviewResponseSchema.safeParse(JSON.parse(jsonCandidate(rawText))); }
  catch { initial = reviewResponseSchema.safeParse(null); }
  if (initial.success) return initial.data;
  // One tightly constrained repair attempt makes provider format differences less
  // likely to change a verdict. A second malformed response is fail-closed.
  const repair = await llm.invoke([
    new SystemMessage("Return valid JSON only. Do not add Markdown or commentary."),
    new HumanMessage(`Convert this mentor response into exactly {"verdict":"solved"|"keep_iterating","feedback":"..."}. Preserve meaning and choose keep_iterating if uncertain.\n\n${rawText.slice(0, 6000)}`)
  ]);
  let repaired: z.SafeParseReturnType<unknown, z.infer<typeof reviewResponseSchema>>;
  try { repaired = reviewResponseSchema.safeParse(JSON.parse(jsonCandidate(messageText(repair.content)))); }
  catch { repaired = reviewResponseSchema.safeParse(null); }
  if (repaired.success) return repaired.data;
  return { verdict: "keep_iterating", feedback: "The mentor returned an invalid review format, so this approach was not marked solved. Please retry your review." };
}

async function fetchProblem(state: typeof MentorState.State) {
  return { problemData: await fetchProblemData(state.problemUrl, state.suppliedStatement) };
}

async function analyzeStrategy(state: typeof MentorState.State) {
  const problem = state.problemData!;
  const llm = getLLM(state.llm);
  const response = await llm.invoke([
    new SystemMessage(guardrail),
    new HumanMessage(`Analyze this Codeforces problem without solving it. Return exactly two labelled sections:\nPATTERN: a short name for the likely optimal technique.\nGUIDANCE: a progressive roadmap that names the representation/state, invariant, complexity target, and 2-4 checkpoints.\n\nTitle: ${problem.title}\nRating: ${problem.difficulty ?? "unrated"}\nTags: ${problem.tags.join(", ") || "unavailable"}\nTime limit: ${problem.timeLimit}; memory limit: ${problem.memoryLimit}\nConstraints clue: ${problem.constraints}\nStatement: ${boundedStatement(problem.statement)}`)
  ]);
  const text = messageText(response.content).trim();
  const pattern = text.match(/PATTERN:\s*([^\n]+)/i)?.[1]?.trim() ?? "Technique to be determined through the constraints";
  const strategy = text.match(/GUIDANCE:\s*([\s\S]+)/i)?.[1]?.trim() ?? text;
  return { requiredPattern: pattern, strategy };
}

async function evaluatePseudocode(state: typeof MentorState.State) {
  const problem = state.problemData!;
  const llm = getLLM(state.llm);
  const previousRounds = boundedPreviousTurns(state.turns);
  const response = await llm.invoke([
    new SystemMessage(guardrail),
    new HumanMessage(`Review the learner's proposed pseudocode against the problem. Required pattern: ${state.requiredPattern}.\nReturn JSON only in this exact shape: {"verdict":"solved"|"keep_iterating","feedback":"single most important correctness or complexity issue followed by up to three conceptual hints"}. Set verdict to solved only if the approach is logically complete and asymptotically appropriate. Never give code or a complete algorithm.\n\nProblem: ${problem.title}\nConstraints clue: ${problem.constraints}\nStatement: ${boundedStatement(problem.statement)}\n\nPrevious rounds (for continuity; do not repeat resolved advice):\n${previousRounds || "None yet."}\n\nLearner pseudocode:\n${state.userPseudocode}`)
  ]);
  const reviewed = await structuredReview(llm, messageText(response.content).trim());
  return { isSolved: reviewed.verdict === "solved", feedback: reviewed.feedback };
}

// The await-user-input node is the UI/API boundary. A learner response starts a new
// graph invocation, preserving this session state; false verdicts return to this node.
function awaitUserInput() { return {}; }

function reviewRouter(state: typeof MentorState.State) {
  return state.isSolved ? END : "await_user_input";
}

export const intakeGraph = new StateGraph(MentorState)
  .addNode("fetch_problem_data", fetchProblem)
  .addNode("analyze_strategy", analyzeStrategy)
  .addNode("await_user_input", awaitUserInput)
  .addEdge(START, "fetch_problem_data")
  .addEdge("fetch_problem_data", "analyze_strategy")
  .addEdge("analyze_strategy", "await_user_input")
  .addEdge("await_user_input", END)
  .compile();

export const reviewGraph = new StateGraph(MentorState)
  .addNode("evaluate_pseudocode", evaluatePseudocode)
  .addNode("await_user_input", awaitUserInput)
  .addEdge(START, "evaluate_pseudocode")
  .addConditionalEdges("evaluate_pseudocode", reviewRouter)
  .addEdge("await_user_input", END)
  .compile();

export async function createTutorState(problemUrl: string, llm: TutorState["llm"], suppliedStatement?: string): Promise<TutorState> {
  const result = await intakeGraph.invoke({ problemUrl, suppliedStatement, llm, turns: [], isSolved: false });
  return result as TutorState;
}

export async function reviewTutorState(state: TutorState, userPseudocode: string, clientTurnId: string): Promise<TutorState> {
  const result = await reviewGraph.invoke({ ...state, turns: state.turns ?? [], userPseudocode });
  const feedback = result.feedback ?? "The mentor could not produce feedback.";
  const isSolved = Boolean(result.isSolved);
  return {
    ...state,
    ...result,
    userPseudocode,
    turns: [...(state.turns ?? []), { id: clientTurnId, learnerMessage: userPseudocode, mentorMessage: feedback, verdict: isSolved ? "solved" : "keep_iterating", createdAt: new Date().toISOString() }]
  } as TutorState;
}
