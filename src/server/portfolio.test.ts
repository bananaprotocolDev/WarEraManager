import { describe, it, expect } from "vitest";
import { buildPortfolio } from "./portfolio";

// Cliente fake con la forma mínima que usa buildPortfolio.
function fakeClient(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    getUserLite: async () => ({ _id: "u1", username: "me", country: "co1" }),
    getCountryById: async () => ({ taxes: { income: 0, market: 10, selfWork: 0 } }),
    getUserCompanies: async () => ({ items: ["c1"] }),
    getCompanyById: async () => ({
      _id: "c1",
      itemCode: "bread",
      production: 10,
      workerCount: 2,
      activeUpgradeLevels: { automatedEngine: 0, breakRoom: 0 },
    }),
    getWorkers: async () => [{ wage: 1 }, { wage: 2 }],
    getPrices: async () => ({ bread: 1.5, grain: 0.1 }),
    getGameConfig: async () => ({
      items: { bread: { type: "product", productionPoints: 1, productionNeeds: { grain: 2 } } },
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
    // neto = 15 - 2 - 3 - 1.5 = 8.5
    expect(c.profit.netProfit).toBeCloseTo(8.5);
    expect(c.maxWageToHire).toBeCloseTo(c.hiring.maxWage);
    expect(r.totalNetProfit).toBeCloseTo(8.5);
    expect(r.wagesAvailable).toBe(true);
    expect(r.estimated).toBe(true); // game-constants sin calibrar
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
});
