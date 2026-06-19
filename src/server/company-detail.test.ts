import { describe, it, expect } from "vitest";
import { buildCompanyDetail } from "./company-detail";

function fakeClient(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    getUserLite: async (id: string) => ({
      _id: id, username: id, country: id === "u1" ? "co1" : undefined,
      skills: { production: { value: 0 }, energy: { value: 0 } },
    }),
    getCountryById: async () => ({ taxes: { income: 0, market: 10, selfWork: 0 } }),
    getCompanyById: async () => ({
      _id: "c1", itemCode: "bread", production: 10, workerCount: 2,
      activeUpgradeLevels: { automatedEngine: 3, breakRoom: 1, storage: 1 },
    }),
    getWorkers: async () => [{ wage: 1 }, { wage: 2 }],
    getPrices: async () => ({ bread: 1.5, grain: 0.1 }),
    getGameConfig: async () => ({
      items: { bread: { type: "product", productionPoints: 1, productionNeeds: { grain: 2 } } },
      upgradesConfig: {
        automatedEngine: { levels: { "3": { stats: { dailyProd: 72 } } } },
        storage: { levels: { "1": { stats: { maxProduction: 200 } } } },
        breakRoom: { levels: { "1": { stats: { maxWorkers: 2 } } } },
      },
    }),
    getWorkOffers: async () => ({ items: [{ wage: 0.5, minEnergy: 50, minProduction: 50 }], nextCursor: null }),
    getUserItemTransactions: async () => ({ items: [], nextCursor: null }),
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
    expect(typeof d.report.name).toBe("string");
    expect(typeof d.report.rarity).toBe("string");
  });

  it("sin auth: no lee trabajadores, wagesAvailable=false", async () => {
    let called = false;
    const client = fakeClient({ getWorkers: async () => { called = true; return []; } });
    const d = await buildCompanyDetail(client, { companyId: "c1", userId: "u1", authenticated: false });
    expect(called).toBe(false);
    expect(d.workers).toEqual([]);
    expect(d.wagesAvailable).toBe(false);
    expect(d.sellPerDay).toBeNull();
  });

  it("incluye la recomendación de contratación", async () => {
    const d = await buildCompanyDetail(fakeClient(), { companyId: "c1", userId: "u1", authenticated: true });
    expect(d.hiring).toBeDefined();
    expect(typeof d.hiring.viable).toBe("boolean");
    expect(d.hiring.maxWagePerPoint).toBeCloseTo(d.report.maxWageToHire);
    expect(d.hiring.freeSlots).toBe(0); // maxWorkers 2 - workerCount 2 = 0
  });

  it("incluye tendencia de precio si se inyecta el store", async () => {
    const priceStore = { getHistory: async () => [{ ts: 1, price: 1.0 }, { ts: 2, price: 1.0 }], recordSnapshot: async () => {}, listItems: async () => [] } as never;
    const d = await buildCompanyDetail(fakeClient(), { companyId: "c1", userId: "u1", authenticated: true, priceStore });
    // precio actual bread 1.5 vs prom 1.0 → up
    expect(d.report.price?.trend).toBe("up");
  });
});
