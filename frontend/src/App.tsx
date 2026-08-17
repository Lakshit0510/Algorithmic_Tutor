import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import type { LlmMode, LlmSettings, TutorSession } from "./types";

const cloudMode = import.meta.env.VITE_APP_MODE === "cloud";
const defaults: LlmSettings = cloudMode
  ? { mode: "groq" }
  : { mode: "local-gguf", baseUrl: "http://127.0.0.1:8080/v1", model: "qwen2.5-1.5b-instruct-q4_k_m.gguf" };
const modeCopy: Record<LlmMode, { label: string; help: string }> = {
  "local-gguf": { label: "Bundled Qwen", help: "Uses the packaged GGUF model on this computer." },
  ollama: { label: "My Ollama", help: "Connects to an Ollama server you already run." },
  groq: { label: "Cloud mentor", help: "Uses the backend's configured Groq key." },
  openai: { label: "OpenAI mentor", help: "Uses the backend's configured OpenAI key." }
};

function useSettings() {
  const [settings, setSettings] = useState<LlmSettings>(() => {
    if (cloudMode) return defaults;
    const saved = localStorage.getItem("algorithmic-tutor.llm");
    return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
  });
  useEffect(() => { if (!cloudMode) localStorage.setItem("algorithmic-tutor.llm", JSON.stringify(settings)); }, [settings]);
  return [settings, setSettings] as const;
}

export default function App() {
  const [settings, setSettings] = useSettings();
  const [url, setUrl] = useState("");
  const [problemStatement, setProblemStatement] = useState("");
  const [session, setSession] = useState<TutorSession>();
  const [restoringSession, setRestoringSession] = useState(true);
  const [pseudocode, setPseudocode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const feedback = useMemo(() => session?.state.feedbackHistory ?? [], [session]);

  useEffect(() => {
    const sessionId = sessionStorage.getItem("algorithmic-tutor.session-id");
    if (!sessionId) { setRestoringSession(false); return; }
    api.get(sessionId).then(setSession).catch(() => sessionStorage.removeItem("algorithmic-tutor.session-id")).finally(() => setRestoringSession(false));
  }, []);

  useEffect(() => {
    if (session) sessionStorage.setItem("algorithmic-tutor.session-id", session.id);
  }, [session]);

  async function start(event: FormEvent) {
    event.preventDefault(); setPending(true); setError("");
    try { const next = await api.start(url.trim(), settings, problemStatement); setSession(next); setPseudocode(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to start a tutoring session."); }
    finally { setPending(false); }
  }
  async function review() {
    if (!session) return; setPending(true); setError("");
    try { setSession(await api.review(session.id, pseudocode)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to review your approach."); }
    finally { setPending(false); }
  }
  return <main className="min-h-screen bg-slate-950 text-slate-100">
    <header className="mx-auto flex max-w-[1600px] items-center justify-between px-5 py-5 md:px-8">
      <div><p className="font-display text-xl font-bold tracking-tight">Algorithmic Tutor</p><p className="text-xs text-slate-400">Think in invariants, not answers.</p></div>
      <button className="quiet-button" onClick={() => setShowSettings((value) => !value)} aria-expanded={showSettings}>Mentor settings</button>
    </header>
    {showSettings && <section className="settings-panel mx-auto max-w-[1600px] px-5 pb-5 md:px-8">
      <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-4">
        <p className="mb-3 text-sm font-semibold">Choose a reasoning engine</p>{cloudMode ? <p className="rounded-xl border border-teal-900 bg-teal-400/10 p-3 text-sm text-teal-100">Cloud deployment uses the server-configured mentor. Local model endpoints are intentionally unavailable on this public site.</p> : <><div className="grid gap-2 md:grid-cols-3">
          {(Object.keys(modeCopy) as LlmMode[]).map((mode) => <button key={mode} className={`mode-option ${settings.mode === mode ? "selected" : ""}`} onClick={() => setSettings({ ...settings, mode })}><strong>{modeCopy[mode].label}</strong><span>{modeCopy[mode].help}</span></button>)}
        </div>
        {(settings.mode === "local-gguf" || settings.mode === "ollama") && <div className="mt-4 grid gap-3 md:grid-cols-2"><label>Base URL<input value={settings.baseUrl ?? ""} onChange={(event) => setSettings({ ...settings, baseUrl: event.target.value })} /></label><label>Model<input value={settings.model ?? ""} onChange={(event) => setSettings({ ...settings, model: event.target.value })} /></label></div>}</>}
      </div>
    </section>}
    <section className="mx-auto max-w-[1600px] px-5 pb-5 md:px-8"><form className="statement-form" onSubmit={start}><div className="url-form"><input aria-label="Codeforces problem URL" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="Paste a Codeforces problem URL — e.g. codeforces.com/problemset/problem/4/A" required /><button disabled={pending}>{pending && !session ? "Loading…" : "Start mentoring"}</button></div><label className="statement-fallback">Problem statement fallback <span>Optional unless Codeforces blocks automatic page reading. Paste the complete statement, including input/output and constraints, then submit again.</span><textarea value={problemStatement} onChange={(event) => setProblemStatement(event.target.value)} placeholder="Paste the Codeforces problem statement here if the page could not be loaded." rows={6} /></label></form>{error && <p role="alert" className="error-banner">{error}</p>}</section>
    {restoringSession ? <section className="mx-auto max-w-[1120px] px-5 py-16 text-slate-400 md:px-8">Restoring your active tutoring session…</section> : !session ? <EmptyState /> : <section className="mx-auto grid max-w-[1600px] gap-5 px-5 pb-8 md:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)] md:px-8">
      <article className="panel overflow-hidden"><div className="panel-head"><div><p className="eyebrow">Problem context</p><h1>{session.state.problemData.title}</h1></div><a href={session.state.problemData.url} target="_blank" rel="noreferrer">Open on CF ↗</a></div>
        <div className="meta-row"><span>{session.state.problemData.difficulty ? `${session.state.problemData.difficulty} rating` : "Unrated"}</span><span>{session.state.problemData.timeLimit}</span><span>{session.state.problemData.memoryLimit}</span></div>
        <div className="tag-row">{session.state.problemData.tags.length ? session.state.problemData.tags.map((tag) => <span key={tag}>{tag}</span>) : <span>Tags unavailable</span>}</div>
        <div className="reading"><h2>Statement <span className="source-badge">{session.state.problemData.statementSource === "user-pasted" ? "Pasted fallback" : "Codeforces"}</span></h2><p>{session.state.problemData.statement}</p><h2>Constraints clue</h2><p>{session.state.problemData.constraints}</p></div>
      </article>
      <aside className="space-y-5"><article className="panel"><div className="panel-head"><div><p className="eyebrow">Strategy map</p><h2>{session.state.requiredPattern}</h2></div></div><p className="strategy">{session.state.strategy}</p></article>
        <article className="panel"><p className="eyebrow">Your approach</p><textarea value={pseudocode} onChange={(event) => setPseudocode(event.target.value)} placeholder="Explain your idea in pseudocode: state, transitions or operations, invariant, and expected complexity." disabled={session.state.isSolved || pending} /><div className="mt-3 flex items-center justify-between gap-3"><span className="text-xs text-slate-400">The mentor reviews reasoning, not syntax.</span><button onClick={review} disabled={pending || session.state.isSolved || pseudocode.trim().length < 20}>{session.state.isSolved ? "Solved" : pending ? "Reviewing…" : "Review approach"}</button></div></article>
        <article className={`panel feedback ${session.state.isSolved ? "solved" : ""}`}><p className="eyebrow">Mentor review</p>{feedback.length === 0 ? <p className="text-slate-400">Write your first approach when ready. We’ll look for a sound invariant and the right complexity.</p> : feedback.map((item, index) => <div className="feedback-item" key={`${item}-${index}`}><span>Round {index + 1}</span><p>{item}</p></div>)}</article>
      </aside>
    </section>}</main>;
}

function EmptyState() { return <section className="mx-auto grid max-w-[1120px] gap-4 px-5 py-16 md:grid-cols-[1.2fr_0.8fr] md:px-8"><div><p className="eyebrow">Deliberate practice</p><h1 className="hero-title">Build the way of thinking that survives unfamiliar problems.</h1><p className="mt-5 max-w-xl text-lg leading-8 text-slate-300">Bring a Codeforces challenge. You’ll get a complexity-aware strategy map, then precise feedback on your own pseudocode—never a copy-paste solution.</p></div><div className="steps-card"><p>How it works</p><ol><li><b>01</b> Read the problem and strategy map.</li><li><b>02</b> Write your proposed approach.</li><li><b>03</b> Iterate until the reasoning and complexity hold.</li></ol></div></section>; }
