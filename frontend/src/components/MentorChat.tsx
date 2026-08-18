import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import type { TutorTurn } from "../types";

type PendingTurn = { id: string; learnerMessage: string };

interface MentorChatProps {
  turns: TutorTurn[];
  isSolved: boolean;
  busy: boolean;
  onReview: (pseudocode: string, clientTurnId: string) => Promise<void>;
}

function nearBottom(element: HTMLElement): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight < 88;
}

export function createClientTurnId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === "function") globalThis.crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

export function MentorChat({ turns, isSolved, busy, onReview }: MentorChatProps) {
  const [draft, setDraft] = useState("");
  const [pendingTurn, setPendingTurn] = useState<PendingTurn>();
  const [error, setError] = useState("");
  const [showJump, setShowJump] = useState(false);
  const transcript = useRef<HTMLOListElement>(null);
  const shouldFollow = useRef(true);

  useEffect(() => {
    const element = transcript.current;
    if (!element || !shouldFollow.current) return;
    element.scrollTo({ top: element.scrollHeight, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    setShowJump(false);
  }, [turns, pendingTurn]);

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    const value = draft.trim();
    if (!value) { setError("Enter a question or describe your approach before sending."); return; }
    if (busy || isSolved) return;
    const submittedDraft = draft;
    const id = createClientTurnId();
    setPendingTurn({ id, learnerMessage: value });
    setError("");
    shouldFollow.current = true;
    try {
      await onReview(value, id);
      setDraft((current) => current === submittedDraft ? "" : current);
      setPendingTurn(undefined);
    } catch (reason) {
      setPendingTurn(undefined);
      setError(reason instanceof Error ? reason.message : "Unable to review your approach.");
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      void submit();
    }
  };

  const scrollToLatest = () => {
    const element = transcript.current;
    if (!element) return;
    shouldFollow.current = true;
    element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
    setShowJump(false);
  };

  return <article className={`panel mentor-chat ${isSolved ? "solved" : ""}`}>
    <div className="panel-head chat-head"><div><p className="eyebrow">Mentor chat</p><h2>{isSolved ? "Approach verified" : `${turns.length} review ${turns.length === 1 ? "round" : "rounds"}`}</h2></div><span className={`chat-status ${isSolved ? "done" : ""}`}>{isSolved ? "Solved" : busy ? "Thinking…" : "In progress"}</span></div>
    <div className="chat-transcript-wrap">
      <ol ref={transcript} className="chat-transcript scrollbox" role="log" aria-live="polite" aria-relevant="additions" aria-label="Mentor conversation" aria-busy={busy} onScroll={(event) => {
        shouldFollow.current = nearBottom(event.currentTarget);
        setShowJump(!shouldFollow.current && (turns.length > 0 || Boolean(pendingTurn)));
      }}>
        {turns.length === 0 && !pendingTurn && <li className="chat-welcome"><span>Mentor</span><p>Share your approach when you are ready. I will check the invariant, edge cases, and complexity—not syntax.</p></li>}
        {turns.map((turn) => <li className="chat-turn" key={turn.id}>
          <section className="chat-message learner"><span>You</span><pre>{turn.learnerMessage}</pre></section>
          <section className="chat-message mentor"><span>Mentor · {turn.verdict === "solved" ? "Verified" : "Keep iterating"}</span><p>{turn.mentorMessage}</p></section>
        </li>)}
        {pendingTurn && <li className="chat-turn" key={pendingTurn.id}>
          <section className="chat-message learner pending"><span>You</span><pre>{pendingTurn.learnerMessage}</pre></section>
          <section className="chat-message mentor typing" role="status"><span>Mentor</span><p>Reviewing your invariant and complexity…</p></section>
        </li>}
      </ol>
      {showJump && <button type="button" className="jump-latest" onClick={scrollToLatest}>Jump to latest</button>}
    </div>
    {isSolved ? <div className="chat-solved" role="status">Your reasoning meets the mentor’s correctness and complexity checks. Start another problem whenever you are ready.</div> : <form className="chat-composer" onSubmit={submit} aria-busy={busy}>
      <label htmlFor="mentor-draft">Your approach <span>Ctrl/Cmd + Enter to send</span></label>
      <textarea id="mentor-draft" value={draft} onChange={(event) => { setDraft(event.target.value); if (error) setError(""); }} onKeyDown={onKeyDown} placeholder="Ask a question or describe your approach, invariant, and expected complexity." aria-invalid={Boolean(error)} aria-describedby={error ? "mentor-error" : undefined} />
      <div className="chat-composer-foot"><span>{busy ? "You can keep typing while the mentor reviews." : "The mentor reviews reasoning, not syntax."}</span><button type="submit" disabled={busy}>{busy ? "Reviewing…" : "Review approach"}</button></div>
      {error && <p id="mentor-error" role="alert" className="chat-error">{error}</p>}
    </form>}
  </article>;
}
