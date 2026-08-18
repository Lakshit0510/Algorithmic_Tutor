import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createClientTurnId, MentorChat } from "./MentorChat";

const existingTurn = {
  id: "e1f91d13-7744-42b9-ba67-4a4b1cb85024",
  learnerMessage: "Maintain a window and shrink it whenever the sum becomes too large.",
  mentorMessage: "State the invariant for the window before deciding that this is correct.",
  verdict: "keep_iterating" as const,
  createdAt: "2026-08-18T00:00:00.000Z"
};

function renderChat(onReview = vi.fn().mockResolvedValue(undefined)) {
  window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as typeof window.matchMedia;
  HTMLElement.prototype.scrollTo = vi.fn();
  render(<MentorChat turns={[existingTurn]} isSolved={false} busy={false} onReview={onReview} />);
  return onReview;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("MentorChat", () => {
  it("renders a paired, scrollable learner and mentor turn", () => {
    renderChat();
    expect(screen.getByRole("log", { name: "Mentor conversation" })).toHaveClass("chat-transcript");
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getByText(/State the invariant/)).toBeInTheDocument();
  });

  it("submits a sufficiently detailed approach with Ctrl+Enter", async () => {
    const onReview = renderChat();
    const input = screen.getByLabelText(/Your approach/);
    const user = userEvent.setup();
    await user.type(input, "I will keep two pointers and prove that each left pointer only moves forward.");
    await user.keyboard("{Control>}{Enter}{/Control}");
    await waitFor(() => expect(onReview).toHaveBeenCalledWith(
      "I will keep two pointers and prove that each left pointer only moves forward.", expect.any(String)
    ));
  });

  it("submits a short question from the Review approach button", async () => {
    const onReview = renderChat();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/Your approach/), "Why?");
    await user.click(screen.getByRole("button", { name: "Review approach" }));
    await waitFor(() => expect(onReview).toHaveBeenCalledWith("Why?", expect.any(String)));
  });

  it("creates a valid turn ID when randomUUID is unavailable on an HTTP origin", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: (bytes: Uint8Array) => { bytes.fill(7); return bytes; }
    });
    expect(createClientTurnId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
