// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchPriceHistory } from "./use-price-history";

afterEach(() => vi.restoreAllMocks());

describe("fetchPriceHistory", () => {
  it("llama a /api/prices/history?item= y devuelve points", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ item: "bread", points: [{ ts: 1000, price: 1.5 }] })),
    );
    const r = await fetchPriceHistory("bread");
    expect(r.points).toEqual([{ ts: 1000, price: 1.5 }]);
    expect(spy.mock.calls[0][0]).toBe("/api/prices/history?item=bread");
  });

  it("lanza si no es ok", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("e", { status: 500 }));
    await expect(fetchPriceHistory("x")).rejects.toThrow();
  });
});
