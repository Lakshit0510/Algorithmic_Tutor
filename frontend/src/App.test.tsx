import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

vi.mock("./api", () => ({
  api: {
    isDesktop: false,
    providerCatalog: vi.fn().mockResolvedValue({ providers: [] }),
    providerProfiles: vi.fn().mockResolvedValue({ profiles: [] }),
    get: vi.fn(),
    start: vi.fn(),
    review: vi.fn(),
    createProviderProfile: vi.fn(),
    deleteProviderProfile: vi.fn(),
    testProvider: vi.fn(),
    saveDesktopSecret: vi.fn(),
    deleteDesktopSecret: vi.fn(),
    provisionDesktopSecrets: vi.fn()
  }
}));

beforeEach(() => sessionStorage.clear());
afterEach(cleanup);

describe("problem query field", () => {
  it("accepts a Codeforces URL immediately", async () => {
    render(<App />);
    const user = userEvent.setup();
    const query = screen.getByLabelText("Codeforces problem URL");
    await user.type(query, "https://codeforces.com/problemset/problem/4/A");
    expect(query).toHaveValue("https://codeforces.com/problemset/problem/4/A");
  });
});
