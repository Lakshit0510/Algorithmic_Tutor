import { describe, expect, it } from "vitest";
import { SessionStore } from "../src/services/sessionStore.js";
import type { TutorState } from "../src/types.js";

const state: TutorState = {
  problemUrl: "https://codeforces.com/problemset/problem/4/A",
  feedbackHistory: [],
  isSolved: false,
  llm: { mode: "groq", model: "test-model" }
};

describe("anonymous session expiry", () => {
  it("deletes stored tutoring context after its TTL", async () => {
    const store = new SessionStore(":memory:", 5);
    const session = store.create(state);
    expect(store.get(session.id)).toMatchObject({ id: session.id, state });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(store.get(session.id)).toBeUndefined();
  });

  it("keeps provider quota counters through the configured window", () => {
    const store = new SessionStore(":memory:");
    expect(store.consumeQuota("openai-model-minute", 2, 60_000)).toBe(true);
    expect(store.consumeQuota("openai-model-minute", 2, 60_000)).toBe(true);
    expect(store.consumeQuota("openai-model-minute", 2, 60_000)).toBe(false);
  });
});
