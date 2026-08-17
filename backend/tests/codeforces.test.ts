import { describe, expect, it } from "vitest";
import { parseCodeforcesUrl } from "../src/services/codeforces.js";

describe("Codeforces URL parsing", () => {
  it("normalizes a problemset URL", () => {
    expect(parseCodeforcesUrl("https://codeforces.com/problemset/problem/4/A")).toEqual({
      contestId: 4,
      index: "A",
      canonicalUrl: "https://codeforces.com/problemset/problem/4/A"
    });
  });

  it("normalizes a contest URL", () => {
    expect(parseCodeforcesUrl("https://codeforces.com/contest/1900/problem/b").canonicalUrl).toBe("https://codeforces.com/problemset/problem/1900/B");
  });

  it("rejects untrusted hosts", () => {
    expect(() => parseCodeforcesUrl("https://codeforces.example/problemset/problem/4/A")).toThrow(/Only public Codeforces/);
  });
});
