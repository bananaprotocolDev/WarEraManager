import { describe, it, expect } from "vitest";
import { assembleCompanyReport } from "./company-report";
import type { ItemDef, PriceMap, Taxes } from "@/lib/economy";

const bread: ItemDef = { code: "bread", type: "product", productionPoints: 1, productionNeeds: { grain: 2 } };
const prices: PriceMap = { bread: 1.5, grain: 0.1 };
const taxes: Taxes = { income: 0, market: 10, selfWork: 0 };
const upgradesConfig = {
  automatedEngine: { levels: { "3": { stats: { dailyProd: 72 } } } },
  storage: { levels: { "1": { stats: { maxProduction: 200 } } } },
};
const company = {
  id: "c1",
  itemCode: "bread",
  production: 191, // stock
  workerCount: 0,
  upgrades: { automatedEngine: 3, breakRoom: 1, storage: 1 },
};

describe("assembleCompanyReport", () => {
  it("usa tasa de automatización (no el stock) y expone stock/almacén/maxWage", () => {
    const r = assembleCompanyReport({ company, item: bread, workers: [], prices, taxes, upgradesConfig });
    expect(r.dailyProductionRate).toBe(72); // automatedEngine L3, NO el stock 191
    expect(r.profit.revenue).toBeCloseTo(108); // 72*1.5
    expect(r.stock).toBe(191);
    expect(r.storageMax).toBe(200);
    expect(r.maxWageToHire).toBeCloseTo(1.17); // margen 1.3 - 10%
    expect(r.marginPerUnit).toBeCloseTo(1.3);
  });

  it("suma salarios de trabajadores como costo diario", () => {
    const r = assembleCompanyReport({ company, item: bread, workers: [{ wage: 2 }, { wage: 3 }], prices, taxes, upgradesConfig });
    expect(r.profit.wageCost).toBe(5);
  });

  it("suma el aporte de trabajadores y aplica el factor de tasa", () => {
    const r = assembleCompanyReport({
      company, item: bread, workers: [], prices, taxes, upgradesConfig,
      workerDailyOutput: 28, rateFactor: 0.5,
    });
    // (72 automatización + 28 trabajadores) × 0.5 = 50
    expect(r.dailyProductionRate).toBe(50);
  });

  it("incluye la tendencia de precio cuando se provee", () => {
    const r = assembleCompanyReport({
      company, item: bread, workers: [], prices, taxes, upgradesConfig,
      priceInfo: { current: 1.6, avg: 1.4, trend: "up" },
    });
    expect(r.price).toEqual({ current: 1.6, avg: 1.4, trend: "up" });
  });
});
