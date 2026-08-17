import * as cheerio from "cheerio";
import { AppError } from "../lib/errors.js";
import type { ProblemData } from "../types.js";

type Locator = { contestId: number; index: string; canonicalUrl: string };
type ApiProblem = { contestId?: number; index: string; name: string; rating?: number; tags: string[] };
let catalogCache: { expiresAt: number; problems: ApiProblem[] } | undefined;

export function parseCodeforcesUrl(input: string): Locator {
  let url: URL;
  try { url = new URL(input); } catch { throw new AppError(400, "Enter a complete Codeforces problem URL."); }
  if (!["codeforces.com", "www.codeforces.com"].includes(url.hostname)) {
    throw new AppError(400, "Only public Codeforces problem URLs are supported.");
  }
  const direct = url.pathname.match(/^\/problemset\/problem\/(\d+)\/([A-Za-z0-9]+)\/?$/);
  const contest = url.pathname.match(/^\/contest\/(\d+)\/problem\/([A-Za-z0-9]+)\/?$/);
  const match = direct ?? contest;
  if (!match) throw new AppError(400, "Use a Codeforces URL such as https://codeforces.com/problemset/problem/4/A.");
  const [, contestId, index] = match;
  return { contestId: Number(contestId), index: index.toUpperCase(), canonicalUrl: `https://codeforces.com/problemset/problem/${contestId}/${index.toUpperCase()}` };
}

async function fetchCatalog(): Promise<ApiProblem[]> {
  if (catalogCache && catalogCache.expiresAt > Date.now()) return catalogCache.problems;
  const response = await fetch("https://codeforces.com/api/problemset.problems");
  if (!response.ok) throw new AppError(502, "Codeforces metadata API is unavailable. Please try again shortly.");
  const payload = await response.json() as { status: string; result?: { problems: ApiProblem[] } };
  if (payload.status !== "OK" || !payload.result) throw new AppError(502, "Codeforces returned invalid problem metadata.");
  catalogCache = { problems: payload.result.problems, expiresAt: Date.now() + 60 * 60 * 1000 };
  return catalogCache.problems;
}

function cleanText(value: string | undefined): string {
  return (value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function statementText($: cheerio.CheerioAPI): string {
  const root = $(".problem-statement");
  root.find("script, style, .sample-test, .input, .output").remove();
  return cleanText(root.text());
}

function extractConstraints(statement: string): string {
  const candidates = statement.match(/(?:1\s*≤|\d+\s*<=|constraints?[:\s]).{0,450}/gi) ?? [];
  return candidates.map(cleanText).filter(Boolean).slice(0, 4).join(" | ") || "No machine-readable constraint block was found; use the full statement and limits.";
}

export async function fetchProblemData(problemUrl: string, suppliedStatement?: string): Promise<ProblemData> {
  const locator = parseCodeforcesUrl(problemUrl);
  const catalog = await fetchCatalog();
  const apiProblem = catalog.find((item) => item.contestId === locator.contestId && item.index.toUpperCase() === locator.index);
  if (!apiProblem) throw new AppError(404, "That Codeforces problem does not exist or is unavailable.");
  let statement = suppliedStatement?.trim();
  let statementSource: ProblemData["statementSource"] = "user-pasted";
  let timeLimit = "Not available via the Codeforces API";
  let memoryLimit = "Not available via the Codeforces API";
  let heading = "";

  if (!statement) {
    const pageResponse = await fetch(locator.canonicalUrl);
    if (pageResponse.status === 404) throw new AppError(404, "That Codeforces problem does not exist or is unavailable.");
    if (!pageResponse.ok) throw new AppError(422, "Codeforces blocked the server from reading this problem page. Paste the problem statement below and try again.");
    const pageHtml = await pageResponse.text();
    if (/Just a moment|cf_chl|challenge-platform/i.test(pageHtml)) {
      throw new AppError(422, "Codeforces blocked the server from reading this problem page. Paste the problem statement below and try again.");
    }
    const $ = cheerio.load(pageHtml);
    statement = statementText($);
    if (!statement) throw new AppError(422, "Codeforces did not return a readable statement. Paste the problem statement below and try again.");
    statementSource = "codeforces";
    heading = cleanText($(".problem-statement .header .title").first().text());
    timeLimit = cleanText($(".time-limit").first().text()).replace(/^time limit per test/i, "") || "Not published";
    memoryLimit = cleanText($(".memory-limit").first().text()).replace(/^memory limit per test/i, "") || "Not published";
  }

  const title = heading.replace(/^\d+[A-Z0-9]*\.\s*/, "") || apiProblem.name || `Problem ${locator.contestId}${locator.index}`;
  return {
    contestId: locator.contestId,
    index: locator.index,
    title,
    url: locator.canonicalUrl,
    statement: statement!,
    statementSource,
    constraints: extractConstraints(statement),
    tags: apiProblem.tags ?? [],
    difficulty: apiProblem.rating ?? null,
    timeLimit,
    memoryLimit
  };
}
