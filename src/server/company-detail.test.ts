import { describe, it, expect } from "vitest";
import { buildCompanyDetail } from "./company-detail";

function fakeClient(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    getUserLite: async () => ({ _id: "u1", username: "me", country: "co1" }),
    getCountryById: async () => ({ taxes: { income: 0, market: 10, selfWork: 0 } }),
    getCompanyById: async () => ({
      _id: "c1", itemCode: "bread", production: 10, workerCount: 2,
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

describe("buildCompanyDetail", () => {
  it("arma el detalle con desglose, trabajadores, upgrades y receta", async () => {
    const d = await buildCompanyDetail(fakeClient(), { companyId: "c1", userId: "u1", authenticated: true });
    expect(d.itemCode).toBe("bread");
    expect(d.report.dailyProductionRate).toBe(72);
    expect(d.report.profit.revenue).toBeCloseTo(108);
    expect(d.workers).toHaveLength(2);
    expect(d.wagesAvailable).toBe(true);
    expect(d.upgrades.automatedEngine).toBe(3);
    expect(d.upgrades.storage).toBe(1);
    expect(d.recipe).toEqual([{ input: "grain", qtyPerUnit: 2 }]);
  });

  it("sin auth: no lee trabajadores, wagesAvailable=false", async () => {
    let called = false;
    const client = fakeClient({ getWorkers: async () => { called = true; return []; } });
    const d = await buildCompanyDetail(client, { companyId: "c1", userId: "u1", authenticated: false });
    expect(called).toBe(false);
    expect(d.workers).toEqual([]);
    expect(d.wagesAvailable).toBe(false);
  });
});
