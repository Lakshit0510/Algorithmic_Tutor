import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchProblemData } from "../src/services/codeforces.js";

afterEach(() => vi.unstubAllGlobals());

describe("manual Codeforces statement fallback", () => {
  it("uses official metadata without requesting the protected HTML page", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: "OK",
      result: { problems: [{ contestId: 2254, index: "A", name: "Riptide", rating: 800, tags: ["implementation"] }] }
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchProblemData(
      "https://codeforces.com/problemset/problem/2254/A",
      "Riptide. Given an array, determine the requested property for each test case. Input contains test cases and constraints. Output the required answer for every case."
    );

    expect(result.statementSource).toBe("user-pasted");
    expect(result.title).toBe("Riptide");
    expect(result.tags).toEqual(["implementation"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://codeforces.com/api/problemset.problems");
  });
});
