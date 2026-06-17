// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchPortfolio } from "./use-portfolio";

afterEach(() => vi.restoreAllMocks());

describe("fetchPortfolio", () => {
  it("llama a /api/report con userId y sin header si no hay token", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ userId: "u1", companies: [], totalNetProfit: 0, wagesAvailable: false, estimated: true })),
    );
    const r = await fetchPortfolio("u1", null);
    expect(r.userId).toBe("u1");
    const [url, opts] = spy.mock.calls[0];
    expect(url).toBe("/api/report?userId=u1");
    expect((opts?.headers as Record<string, string>) ?? {}).not.toHaveProperty("X-API-Key");
  });

  it("incluye X-API-Key cuando hay token", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ userId: "u1", companies: [], totalNetProfit: 0, wagesAvailable: true, estimated: true })),
    );
    await fetchPortfolio("u1", "tok");
    const opts = spy.mock.calls[0][1];
    expect((opts?.headers as Record<string, string>)["X-API-Key"]).toBe("tok");
  });

  it("lanza si la respuesta no es ok", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("err", { status: 502 }));
    await expect(fetchPortfolio("u1", null)).rejects.toThrow();
  });
});
