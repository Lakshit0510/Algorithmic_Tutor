import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MentorChat } from "./MentorChat";

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

afterEach(cleanup);

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
});
