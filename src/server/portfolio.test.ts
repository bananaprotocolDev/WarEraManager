import { describe, it, expect } from "vitest";
import { buildPortfolio } from "./portfolio";

// Cliente fake con la forma mínima que usa buildPortfolio.
function fakeClient(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    getUserLite: async () => ({ _id: "u1", username: "me", country: "co1" }),
    getCountryById: async () => ({ taxes: { income: 0, market: 10, selfWork: 0 } }),
    getUserCompanies: async () => ({ items: ["c1"] }),
    getCompanyById: async () => ({
      _id: "c1", itemCode: "bread", production: 50, workerCount: 2,
      activeUpgradeLevels: { automatedEngine: 3, breakRoom: 1, storage: 1 },
    }),
    getWorkers: async () => [{ wage: 1 }, { wage: 2 }],
    getPrices: async () => ({ bread: 1.5, grain: 0.1 }),
    getGameConfig: async () => ({
      items: { bread: { type: "product", productionPoints: 1, productionNeeds: { grain: 2 } } },
      upgradesConfig: { automatedEngine: { levels: { "3": { stats: { dailyProd: 72 } } } }, storage: { levels: { "1": { stats: { maxProduction: 200 } } } } },
    }),
    ...overrides,
  } as never;
}

describe("buildPortfolio", () => {
  it("arma el reporte con beneficio por empresa y total", async () => {
    const r = await buildPortfolio(fakeClient(), { userId: "u1", authenticated: true });
    expect(r.companies).toHaveLength(1);
    const c = r.companies[0];
    expect(c.itemCode).toBe("bread");
    // tasa 72 ; ingresos 108 ; inputs 14.4 ; salarios 3 ; impuesto 10.8 ; neto 79.8
    expect(c.dailyProductionRate).toBe(72);
    expect(c.profit.netProfit).toBeCloseTo(79.8);
    expect(c.stock).toBe(50);
    expect(c.storageMax).toBe(200);
    expect(c.maxWageToHire).toBeCloseTo(c.marginPerUnit * 0.9);
    expect(r.totalNetProfit).toBeCloseTo(79.8);
    expect(r.wagesAvailable).toBe(true);
    expect(r.estimated).toBe(true);
    expect(typeof r.companies[0].name).toBe("string");
    expect(typeof r.companies[0].rarity).toBe("string");
  });

  it("aplica el rateFactor a la tasa de producción", async () => {
    const r = await buildPortfolio(fakeClient(), { userId: "u1", authenticated: true, rateFactor: 0.5 });
    // automatización 72 × 0.5 = 36
    expect(r.companies[0].dailyProductionRate).toBe(36);
  });

  it("sin autenticación no intenta leer salarios (wageCost=0, wagesAvailable=false)", async () => {
    let called = false;
    const client = fakeClient({
      getWorkers: async () => {
        called = true;
        return [];
      },
    });
    const r = await buildPortfolio(client, { userId: "u1", authenticated: false });
    expect(called).toBe(false); // ni se llama el endpoint auth-gated
    expect(r.companies[0].profit.wageCost).toBe(0);
    expect(r.wagesAvailable).toBe(false);
  });

  it("con autenticación, si getWorkers falla, wagesAvailable=false", async () => {
    const client = fakeClient({
      getWorkers: async () => {
        throw new Error("HTTP 401");
      },
    });
    const r = await buildPortfolio(client, { userId: "u1", authenticated: true });
    expect(r.companies[0].profit.wageCost).toBe(0);
    expect(r.wagesAvailable).toBe(false);
  });

  it("incluye tendencia de precio si se inyecta el store", async () => {
    const priceStore = { getHistory: async () => [{ ts: 1, price: 1.0 }, { ts: 2, price: 1.0 }], recordSnapshot: async () => {}, listItems: async () => [] } as never;
    const r = await buildPortfolio(fakeClient(), { userId: "u1", authenticated: true, priceStore });
    // precio actual bread 1.5 vs prom 1.0 → up
    expect(r.companies[0].price?.trend).toBe("up");
  });
});
