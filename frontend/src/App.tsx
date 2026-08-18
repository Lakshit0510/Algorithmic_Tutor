import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { MentorChat } from "./components/MentorChat";
import type { LlmMode, LlmSettings, ProviderPreset, ProviderProfile, TutorSession } from "./types";

const cloudMode = import.meta.env.VITE_APP_MODE === "cloud";
const defaultSettings: LlmSettings = { mode: "ollama", baseUrl: "http://127.0.0.1:11434", model: "qwen2.5:1.5b" };

const modeCopy: Record<LlmMode, { label: string; help: string }> = {
  "local-gguf": { label: "Legacy bundled GGUF", help: "For the separate offline build only." },
  ollama: { label: "Local Ollama", help: "Uses a model already pulled into Ollama." },
  groq: { label: "Groq", help: "Fast hosted models with your own key." },
  openai: { label: "OpenAI", help: "Native OpenAI API profile." },
  "openai-compatible": { label: "Compatible API", help: "OpenRouter, local servers, or a compatible provider." },
  anthropic: { label: "Anthropic", help: "Native Claude API profile." },
  google: { label: "Google Gemini", help: "Native Gemini API profile." }
};

function useSettings() {
  const [settings, setSettings] = useState<LlmSettings>(() => {
    if (cloudMode) return defaultSettings;
    try { return { ...defaultSettings, ...JSON.parse(localStorage.getItem("algorithmic-tutor.llm") ?? "{}") }; }
    catch { return defaultSettings; }
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
  const [startPending, setStartPending] = useState(false);
  const [reviewPending, setReviewPending] = useState(false);
  const [error, setError] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [catalog, setCatalog] = useState<ProviderPreset[]>([]);
  const [profiles, setProfiles] = useState<ProviderProfile[]>([]);
  const [providerError, setProviderError] = useState("");
  const [providerNotice, setProviderNotice] = useState("");
  const [newPresetId, setNewPresetId] = useState("ollama");
  const [newModel, setNewModel] = useState("");
  const [newBaseUrl, setNewBaseUrl] = useState("");
  const [newKey, setNewKey] = useState("");

  const activeProfile = useMemo(() => profiles.find((profile) => profile.id === settings.profileId), [profiles, settings.profileId]);
  const selectedPreset = useMemo(() => catalog.find((preset) => preset.id === newPresetId), [catalog, newPresetId]);

  const loadProviders = async () => {
    try {
      const [{ providers }, { profiles: storedProfiles }] = await Promise.all([api.providerCatalog(), api.providerProfiles()]);
      setCatalog(providers);
      setProfiles(storedProfiles);
      if (api.isDesktop) {
        await api.provisionDesktopSecrets(storedProfiles.map((profile) => profile.id));
        const refreshed = await api.providerProfiles();
        setProfiles(refreshed.profiles);
      }
    } catch (reason) { setProviderError(reason instanceof Error ? reason.message : "Unable to load provider settings."); }
  };

  useEffect(() => {
    const sessionId = sessionStorage.getItem("algorithmic-tutor.session-id");
    if (!sessionId) { setRestoringSession(false); return; }
    api.get(sessionId).then(setSession).catch(() => sessionStorage.removeItem("algorithmic-tutor.session-id")).finally(() => setRestoringSession(false));
  }, []);
  useEffect(() => { if (session) sessionStorage.setItem("algorithmic-tutor.session-id", session.id); }, [session]);
  useEffect(() => { void loadProviders(); }, []);
  useEffect(() => {
    if (!selectedPreset) return;
    setNewModel(selectedPreset.defaultModel);
    setNewBaseUrl(selectedPreset.defaultBaseUrl ?? "");
    setNewKey("");
  }, [newPresetId, selectedPreset]);

  async function start(event: FormEvent) {
    event.preventDefault(); setStartPending(true); setError("");
    try { const next = await api.start(url.trim(), cloudMode ? undefined : settings, problemStatement); setSession(next); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to start a tutoring session."); }
    finally { setStartPending(false); }
  }

  async function review(pseudocode: string, clientTurnId: string) {
    if (!session) return;
    setReviewPending(true);
    try { setSession(await api.review(session.id, pseudocode, clientTurnId)); }
    finally { setReviewPending(false); }
  }

  async function createProfile(event: FormEvent) {
    event.preventDefault(); setProviderError(""); setProviderNotice("");
    try {
      const profile = await api.createProviderProfile({ presetId: newPresetId, model: newModel || undefined, baseUrl: newBaseUrl || undefined });
      if (newKey.trim()) await api.saveDesktopSecret(profile.id, newKey.trim());
      await loadProviders();
      setSettings({ mode: profile.mode, model: profile.model, baseUrl: profile.baseUrl, profileId: profile.id });
      setProviderNotice(newKey.trim() ? "Profile saved and API key secured in Windows Credential Manager." : "Profile saved. Add a key before testing a cloud provider.");
      setNewKey("");
    } catch (reason) { setProviderError(reason instanceof Error ? reason.message : "Unable to save the provider profile."); }
  }

  async function testProfile(profile: ProviderProfile) {
    setProviderError(""); setProviderNotice("");
    try { await api.testProvider(profile.id); setProviderNotice(`${profile.label} is connected and responded successfully.`); }
    catch (reason) { setProviderError(reason instanceof Error ? reason.message : "The provider test failed."); }
  }

  async function deleteProfile(profile: ProviderProfile) {
    setProviderError("");
    try {
      await api.deleteDesktopSecret(profile.id);
      await api.deleteProviderProfile(profile.id);
      if (settings.profileId === profile.id) setSettings(defaultSettings);
      await loadProviders();
    } catch (reason) { setProviderError(reason instanceof Error ? reason.message : "Unable to remove the provider profile."); }
  }

  return <main className="min-h-screen bg-slate-950 text-slate-100">
    <header className="mx-auto flex max-w-[1600px] items-center justify-between px-5 py-5 md:px-8">
      <div><p className="font-display text-xl font-bold tracking-tight">Algorithmic Tutor</p><p className="text-xs text-slate-400">Think in invariants, not answers.</p></div>
      <button className="quiet-button" onClick={() => setShowSettings((value) => !value)} aria-expanded={showSettings}>Mentor settings</button>
    </header>
    {showSettings && <section className="settings-panel mx-auto max-w-[1600px] px-5 pb-5 md:px-8">
      <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-4">
        <p className="mb-3 text-sm font-semibold">Choose a reasoning engine</p>
        {cloudMode ? <p className="rounded-xl border border-teal-900 bg-teal-400/10 p-3 text-sm text-teal-100">This public deployment uses its server-configured mentor. API keys are never accepted by the website.</p> : <>
          <div className="active-provider"><span>Active profile</span><select value={settings.profileId ?? "default"} onChange={(event) => {
            const profile = profiles.find((item) => item.id === event.target.value);
            setSettings(profile ? { mode: profile.mode, model: profile.model, baseUrl: profile.baseUrl, profileId: profile.id } : defaultSettings);
          }}><option value="default">Default local Ollama · {defaultSettings.model}</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.label} · {profile.model}{profile.hasCredential ? " · key configured" : ""}</option>)}</select></div>
          {activeProfile ? <div className="profile-actions"><button type="button" onClick={() => void testProfile(activeProfile)}>Test connection</button><button type="button" className="danger-button" onClick={() => void deleteProfile(activeProfile)}>Remove profile</button></div> : <div className="local-default"><strong>Default Ollama</strong><span>Make sure Ollama is running and has pulled {defaultSettings.model}.</span></div>}
          <form className="provider-form" onSubmit={createProfile}>
            <p>Add provider profile</p><div className="provider-fields"><label>Provider<select value={newPresetId} onChange={(event) => setNewPresetId(event.target.value)}>{catalog.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</select></label><label>Model<input value={newModel} onChange={(event) => setNewModel(event.target.value)} placeholder="Model ID" required /></label>{selectedPreset?.defaultBaseUrl !== undefined || newPresetId === "openai-compatible" ? <label>Base URL<input value={newBaseUrl} onChange={(event) => setNewBaseUrl(event.target.value)} placeholder="https://provider.example/v1" /></label> : null}{selectedPreset?.requiresCredential && <label>API key<input type="password" value={newKey} onChange={(event) => setNewKey(event.target.value)} placeholder={api.isDesktop ? "Saved only in Windows Credential Manager" : "Available in the desktop app only"} disabled={!api.isDesktop} autoComplete="off" /></label>}</div>
            <button disabled={selectedPreset?.requiresCredential && !api.isDesktop}>Save profile</button>
          </form>
          <p className="settings-help">Ollama is discovered locally. Cloud keys are supported only in the Windows desktop app and are never saved in browser storage, session history, or SQLite.</p>
          {providerNotice && <p className="provider-notice" role="status">{providerNotice}</p>}{providerError && <p className="error-banner" role="alert">{providerError}</p>}
        </>}
      </div>
    </section>}
    <section className="mx-auto max-w-[1600px] px-5 pb-5 md:px-8"><form className="statement-form" onSubmit={start}><div className="url-form"><input aria-label="Codeforces problem URL" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="Paste a Codeforces problem URL — e.g. codeforces.com/problemset/problem/4/A" required /><button disabled={startPending}>{startPending ? "Loading…" : "Start mentoring"}</button></div><label className="statement-fallback">Problem statement fallback <span>Optional unless Codeforces blocks automatic page reading. Paste the complete statement, including input/output and constraints, then submit again.</span><textarea value={problemStatement} onChange={(event) => setProblemStatement(event.target.value)} placeholder="Paste the Codeforces problem statement here if the page could not be loaded." rows={6} /></label></form>{error && <p role="alert" className="error-banner">{error}</p>}</section>
    {restoringSession ? <section className="mx-auto max-w-[1120px] px-5 py-16 text-slate-400 md:px-8">Restoring your active tutoring session…</section> : !session ? <EmptyState /> : <section className="mx-auto grid max-w-[1600px] gap-5 px-5 pb-8 md:grid-cols-[minmax(0,1fr)_minmax(390px,0.9fr)] md:px-8">
      <article className="panel overflow-hidden"><div className="panel-head"><div><p className="eyebrow">Problem context</p><h1>{session.state.problemData.title}</h1></div><a href={session.state.problemData.url} target="_blank" rel="noreferrer">Open on CF ↗</a></div><div className="meta-row"><span>{session.state.problemData.difficulty ? `${session.state.problemData.difficulty} rating` : "Unrated"}</span><span>{session.state.problemData.timeLimit}</span><span>{session.state.problemData.memoryLimit}</span></div><div className="tag-row">{session.state.problemData.tags.length ? session.state.problemData.tags.map((tag) => <span key={tag}>{tag}</span>) : <span>Tags unavailable</span>}</div><div className="reading"><h2>Statement <span className="source-badge">{session.state.problemData.statementSource === "user-pasted" ? "Pasted fallback" : "Codeforces"}</span></h2><p>{session.state.problemData.statement}</p><h2>Constraints clue</h2><p>{session.state.problemData.constraints}</p></div></article>
      <aside className="space-y-5 mentor-column"><article className="panel strategy-panel"><div className="panel-head"><div><p className="eyebrow">Strategy map</p><h2>{session.state.requiredPattern}</h2></div></div><p className="strategy">{session.state.strategy}</p></article><MentorChat turns={session.state.turns ?? []} isSolved={session.state.isSolved} busy={reviewPending} onReview={review} /></aside>
    </section>}</main>;
}

function EmptyState() { return <section className="mx-auto grid max-w-[1120px] gap-4 px-5 py-16 md:grid-cols-[1.2fr_0.8fr] md:px-8"><div><p className="eyebrow">Deliberate practice</p><h1 className="hero-title">Build the way of thinking that survives unfamiliar problems.</h1><p className="mt-5 max-w-xl text-lg leading-8 text-slate-300">Bring a Codeforces challenge. You’ll get a complexity-aware strategy map, then a focused chat review of your own pseudocode—never a copy-paste solution.</p></div><div className="steps-card"><p>How it works</p><ol><li><b>01</b> Read the problem and strategy map.</li><li><b>02</b> Write your proposed approach in the mentor chat.</li><li><b>03</b> Iterate until the reasoning and complexity hold.</li></ol></div></section>; }
