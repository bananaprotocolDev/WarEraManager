import { describe, it, expect } from "vitest";
import { assembleCompanyReport } from "./company-report";
import { bestDestinationValue } from "@/lib/economy";
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
  name: "",
  isFull: false,
  estimatedValue: 0,
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

  it("expone name, rarity, isFull y estimatedValue", () => {
    const r = assembleCompanyReport({
      company: { ...company, name: "MI CORP", isFull: true, estimatedValue: 500 },
      item: { ...bread, rarity: "uncommon" }, workers: [], prices, taxes, upgradesConfig,
    });
    expect(r.name).toBe("MI CORP");
    expect(r.rarity).toBe("uncommon");
    expect(r.isFull).toBe(true);
    expect(r.estimatedValue).toBe(500);
  });

  it("modelo aplica bonus de país (potentialRate) y marca estimated", () => {
    const r = assembleCompanyReport({
      company, item: bread, workers: [], prices, taxes, upgradesConfig,
      workerDailyOutput: 0, productionBonus: 0.25,
    });
    // modelo = (72 + 0) × 1.25 = 90
    expect(r.dailyProductionRate).toBeCloseTo(90);
    expect(r.potentialRate).toBeCloseTo(90);
    expect(r.measured).toBe(false);
    expect(r.profit.estimated).toBe(true);
  });

  it("con measuredRate usa el real y marca measured (no estimado)", () => {
    const r = assembleCompanyReport({
      company, item: bread, workers: [], prices, taxes, upgradesConfig,
      workerDailyOutput: 0, productionBonus: 0.25, measuredRate: 40,
    });
    expect(r.dailyProductionRate).toBe(40); // real
    expect(r.potentialRate).toBeCloseTo(90); // modelo, para comparar
    expect(r.measured).toBe(true);
    expect(r.profit.estimated).toBe(false);
  });
});

describe("assembleCompanyReport con itemValue", () => {
  it("usa el valor de mejor destino para margen/maxWage y expone destination", () => {
    const item = { code: "petroleum", type: "raw" as const, productionPoints: 1, productionNeeds: {} };
    const taxes = { income: 4, market: 1, selfWork: 4 };
    const prices = { petroleum: 0.0951, oil: 0.1775 };
    const itemValue = bestDestinationValue({
      item, prices, taxes,
      downstream: { item: { code: "oil", type: "product" as const, productionPoints: 1, productionNeeds: { petroleum: 1 } } },
      marketWagePerPoint: 0.13,
    });
    const report = assembleCompanyReport({
      company: { id: "c1", itemCode: "petroleum", production: 0, workerCount: 0, upgrades: { automatedEngine: 1, breakRoom: 1, storage: 1 }, name: "OPC", isFull: false, estimatedValue: 0 },
      item, workers: [], prices, taxes,
      upgradesConfig: { automatedEngine: { levels: { "1": { stats: { dailyProd: 24 } } } }, storage: { levels: { "1": { stats: { maxProduction: 200 } } } }, breakRoom: { levels: { "1": { stats: { maxWorkers: 2 } } } } },
      itemValue,
    });
    expect(report.destination).toBe("sell");
    expect(report.marginPerUnit).toBeCloseTo(0.0951 * 0.99, 4);
    expect(report.maxWageToHire).toBeCloseTo(0.0951 * 0.99, 4);
  });

  it("con insumos: margen y maxWage descuentan el costo de insumos (rama itemValue)", () => {
    const item = { code: "steel", type: "product" as const, productionPoints: 10, productionNeeds: { iron: 10 } };
    const taxes = { income: 4, market: 1, selfWork: 4 };
    const prices = { steel: 1.5889, iron: 0.0805 };
    const itemValue = bestDestinationValue({ item, prices, taxes }); // sin downstream → vende
    const report = assembleCompanyReport({
      company: { id: "c1", itemCode: "steel", production: 0, workerCount: 0, upgrades: { automatedEngine: 1, breakRoom: 1, storage: 1 }, name: "X", isFull: false, estimatedValue: 0 },
      item, workers: [], prices, taxes,
      upgradesConfig: { automatedEngine: { levels: { "1": { stats: { dailyProd: 24 } } } }, storage: { levels: { "1": { stats: { maxProduction: 200 } } } }, breakRoom: { levels: { "1": { stats: { maxWorkers: 2 } } } } },
      itemValue,
    });
    const expMargin = 1.5889 * 0.99 - 10 * 0.0805;
    expect(report.marginPerUnit).toBeCloseTo(expMargin, 4);
    expect(report.maxWageToHire).toBeCloseTo(expMargin / 10, 4);
    expect(report.destination).toBe("sell");
  });
});
