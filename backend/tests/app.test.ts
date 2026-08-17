import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

describe("API boundary", () => {
  it("reports health", async () => {
    const response = await request(createApp()).get("/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  it("rejects non-Codeforces problem URL before provider work", async () => {
    const response = await request(createApp()).post("/api/sessions").send({ problemUrl: "https://example.com/problem/1" });
    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/Codeforces/);
  });
});
