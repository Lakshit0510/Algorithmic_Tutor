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
    if (value.length < 20 || busy || isSolved) return;
    const id = crypto.randomUUID();
    setPendingTurn({ id, learnerMessage: value });
    setError("");
    shouldFollow.current = true;
    try {
      await onReview(value, id);
      setDraft("");
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
      <textarea id="mentor-draft" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={onKeyDown} placeholder="Describe the state, operations, invariant, and expected complexity." disabled={busy} aria-invalid={Boolean(error)} aria-describedby={error ? "mentor-error" : undefined} />
      <div className="chat-composer-foot"><span>{draft.trim().length < 20 ? "Use at least 20 characters." : "The mentor reviews reasoning, not syntax."}</span><button disabled={busy || draft.trim().length < 20}>{busy ? "Reviewing…" : "Review approach"}</button></div>
      {error && <p id="mentor-error" role="alert" className="chat-error">{error}</p>}
    </form>}
  </article>;
}
