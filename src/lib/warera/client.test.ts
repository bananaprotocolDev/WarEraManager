import { describe, it, expect, vi, afterEach } from "vitest";
import { WareraClient } from "./client";

function mockFetchOnce(data: unknown) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(JSON.stringify({ result: { data } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
}

afterEach(() => vi.restoreAllMocks());

describe("WareraClient", () => {
  it("construye la URL tRPC con input codificado y desenvuelve la data", async () => {
    const spy = mockFetchOnce({ grain: 0.075 });
    const client = new WareraClient();
    const prices = await client.getPrices();
    expect(prices.grain).toBeCloseTo(0.075);

    const calledUrl = spy.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/trpc/itemTrading.getPrices");

    // Las cabeceras CORS son las únicas "credenciales" que envía el cliente.
    const calledOptions = spy.mock.calls[0][1] as RequestInit;
    const headers = calledOptions.headers as Record<string, string>;
    expect(headers["Origin"]).toBe("https://app.warera.io");
  });

  it("envía el input como parámetro JSON url-encoded", async () => {
    const spy = mockFetchOnce({
      _id: "c1",
      itemCode: "bread",
      production: 10,
      workerCount: 2,
      activeUpgradeLevels: { automatedEngine: 0, breakRoom: 0 },
    });
    const client = new WareraClient();
    await client.getCompanyById("c1");
    const calledUrl = spy.mock.calls[0][0] as string;
    expect(calledUrl).toContain("company.getById");
    expect(calledUrl).toContain(encodeURIComponent(JSON.stringify({ companyId: "c1" })));
  });

  it("lanza error si el HTTP status no es ok", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("nope", { status: 500 }));
    const client = new WareraClient();
    await expect(client.getPrices()).rejects.toThrow(/500/);
  });

  it("envía X-API-Key cuando se construye con apiKey", async () => {
    const spy = mockFetchOnce({ grain: 0.1 });
    const client = new WareraClient({ apiKey: "secret-token" });
    await client.getPrices();
    const opts = spy.mock.calls[0][1] as RequestInit;
    const headers = opts.headers as Record<string, string>;
    expect(headers["X-API-Key"]).toBe("secret-token");
  });

  it("no envía X-API-Key cuando no hay apiKey", async () => {
    const spy = mockFetchOnce({ grain: 0.1 });
    const client = new WareraClient();
    await client.getPrices();
    const opts = spy.mock.calls[0][1] as RequestInit;
    const headers = opts.headers as Record<string, string>;
    expect(headers["X-API-Key"]).toBeUndefined();
  });

  it("getGameConfig parsea items", async () => {
    mockFetchOnce({ items: { bread: { type: "product", productionPoints: 1, productionNeeds: {} } } });
    const client = new WareraClient();
    const gc = await client.getGameConfig();
    expect(gc.items.bread.type).toBe("product");
  });

  it("getUserLite envía userId y parsea", async () => {
    const spy = mockFetchOnce({ _id: "u1", username: "majima", country: "co1" });
    const client = new WareraClient();
    const u = await client.getUserLite("u1");
    expect(u.country).toBe("co1");
    const calledUrl = spy.mock.calls[0][0] as string;
    expect(calledUrl).toContain("user.getUserLite");
    expect(calledUrl).toContain(encodeURIComponent(JSON.stringify({ userId: "u1" })));
  });

  it("getUserItemTransactions envía userId+itemCode y parsea", async () => {
    const spy = mockFetchOnce({ items: [{ sellerId: "u1", money: 10, quantity: 5, createdAt: "2026-06-17T00:00:00.000Z" }], nextCursor: null });
    const client = new WareraClient({ apiKey: "tok" });
    const r = await client.getUserItemTransactions("u1", "steel");
    expect(r.items[0].quantity).toBe(5);
    const url = spy.mock.calls[0][0] as string;
    expect(url).toContain("transaction.getPaginatedTransactions");
    expect(url).toContain(encodeURIComponent(JSON.stringify({ userId: "u1", itemCode: "steel", limit: 100 })));
    const opts = spy.mock.calls[0][1] as RequestInit;
    expect((opts.headers as Record<string, string>)["X-API-Key"]).toBe("tok");
  });

  it("getWorkOffers envía filtros y parsea", async () => {
    const spy = mockFetchOnce({ items: [{ wage: 0.15, minEnergy: 50, minProduction: 50 }], nextCursor: null });
    const client = new WareraClient();
    const r = await client.getWorkOffers({ regionId: "r1", limit: 20 });
    expect(r.items[0].minEnergy).toBe(50);
    const url = spy.mock.calls[0][0] as string;
    expect(url).toContain("workOffer.getWorkOffersPaginated");
  });
});
