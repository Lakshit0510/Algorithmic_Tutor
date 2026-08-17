import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
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
  feedbackHistory: Annotation<string[]>({ reducer: (oldValue, nextValue) => [...oldValue, ...nextValue], default: () => [] }),
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
  const response = await llm.invoke([
    new SystemMessage(guardrail),
    new HumanMessage(`Review the learner's proposed pseudocode against the problem. Required pattern: ${state.requiredPattern}.\nReturn exactly:\nVERDICT: SOLVED only if the approach is both logically complete and asymptotically appropriate; otherwise KEEP_ITERATING.\nFEEDBACK: Explain the single most important correctness or complexity issue, then give up to three conceptual hints. Never give a full algorithm or code.\n\nProblem: ${problem.title}\nConstraints clue: ${problem.constraints}\nStatement: ${boundedStatement(problem.statement)}\n\nLearner pseudocode:\n${state.userPseudocode}`)
  ]);
  const text = messageText(response.content).trim();
  const isSolved = /^VERDICT:\s*SOLVED\b/im.test(text);
  const feedback = (text.match(/FEEDBACK:\s*([\s\S]+)/i)?.[1] ?? text).trim();
  return { isSolved, feedback, feedbackHistory: [feedback] };
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
  const result = await intakeGraph.invoke({ problemUrl, suppliedStatement, llm, feedbackHistory: [], isSolved: false });
  return result as TutorState;
}

export async function reviewTutorState(state: TutorState, userPseudocode: string): Promise<TutorState> {
  const result = await reviewGraph.invoke({ ...state, userPseudocode });
  return { ...state, ...result, userPseudocode } as TutorState;
}
