import { describe, it, expect, vi, afterEach } from "vitest";
import { GET } from "./route";

function ctx(proc: string[]) {
  return { params: Promise.resolve({ proc }) };
}
function mockUpstream(data: unknown, status = 200) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(JSON.stringify({ result: { data } }), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}
afterEach(() => vi.restoreAllMocks());

describe("proxy /api/warera/[...proc]", () => {
  it("reenvía un proc permitido y devuelve la data upstream", async () => {
    const spy = mockUpstream({ grain: 0.1 });
    const req = new Request("http://localhost/api/warera/itemTrading.getPrices");
    const res = await GET(req, ctx(["itemTrading.getPrices"]));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.data.grain).toBe(0.1);
    // upstream recibió el Origin correcto
    const opts = spy.mock.calls[0][1] as RequestInit;
    expect((opts.headers as Record<string, string>)["Origin"]).toBe("https://app.warera.io");
  });

  it("rechaza un proc no permitido con 403 sin llamar upstream", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    const req = new Request("http://localhost/api/warera/admin.deleteEverything");
    const res = await GET(req, ctx(["admin.deleteEverything"]));
    expect(res.status).toBe(403);
    expect(spy).not.toHaveBeenCalled();
  });

  it("reenvía X-API-Key del request entrante al upstream", async () => {
    const spy = mockUpstream({ ok: true });
    const req = new Request("http://localhost/api/warera/worker.getWorkers?input=%7B%7D", {
      headers: { "X-API-Key": "tok" },
    });
    await GET(req, ctx(["worker.getWorkers"]));
    const opts = spy.mock.calls[0][1] as RequestInit;
    expect((opts.headers as Record<string, string>)["X-API-Key"]).toBe("tok");
  });

  it("propaga el input query-string al upstream", async () => {
    const spy = mockUpstream({ ok: true });
    const input = encodeURIComponent(JSON.stringify({ companyId: "c1" }));
    const req = new Request(`http://localhost/api/warera/company.getById?input=${input}`);
    await GET(req, ctx(["company.getById"]));
    const calledUrl = spy.mock.calls[0][0] as string;
    expect(calledUrl).toContain("company.getById");
    expect(calledUrl).toContain(input);
  });
});
