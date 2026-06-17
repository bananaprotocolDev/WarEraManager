// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchCompanyDetail } from "./use-company-detail";

afterEach(() => vi.restoreAllMocks());

describe("fetchCompanyDetail", () => {
  it("llama a /api/company/:id?userId= y agrega X-API-Key si hay token", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ id: "c1" })));
    await fetchCompanyDetail("c1", "u1", "tok");
    const [url, opts] = spy.mock.calls[0];
    expect(url).toBe("/api/company/c1?userId=u1");
    expect((opts?.headers as Record<string, string>)["X-API-Key"]).toBe("tok");
  });

  it("lanza si no es ok", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("e", { status: 502 }));
    await expect(fetchCompanyDetail("c1", "u1", null)).rejects.toThrow();
  });
});
