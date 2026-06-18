import { describe, it, expect } from "vitest";
import { companyProfit } from "./profit";
import type { ItemDef, PriceMap, Taxes } from "./types";

const bread: ItemDef = { code: "bread", type: "product", productionPoints: 1, productionNeeds: { grain: 2 } };
const prices: PriceMap = { bread: 1.5, grain: 0.1 };
const taxes: Taxes = { income: 0, market: 10, selfWork: 0 };

describe("companyProfit (tasa diaria)", () => {
  it("usa la tasa diaria, no el stock", () => {
    const r = companyProfit({ dailyProductionRate: 72, item: bread, prices, taxes, wageCostPerDay: 0 });
    expect(r.dailyProductionRate).toBe(72);
    expect(r.usefulRate).toBe(72); // sin sellPerDay, util = tasa
    // ingresos = 72 * 1.5 = 108
    expect(r.revenue).toBeCloseTo(108);
    // inputs = 72 * 2 * 0.1 = 14.4
    expect(r.inputCost).toBeCloseTo(14.4);
    // impuesto = 108 * 0.10 = 10.8
    expect(r.tax).toBeCloseTo(10.8);
    // neto = 108 - 14.4 - 0 - 10.8 = 82.8
    expect(r.netProfit).toBeCloseTo(82.8);
    expect(r.sellAssumed).toBe(true);
    expect(r.estimated).toBe(true);
  });

  it("topea por venta/día cuando se provee sellPerDay", () => {
    const r = companyProfit({ dailyProductionRate: 72, sellPerDay: 30, item: bread, prices, taxes });
    expect(r.usefulRate).toBe(30); // min(72, 30)
    expect(r.revenue).toBeCloseTo(45); // 30*1.5
    expect(r.sellAssumed).toBe(false);
    expect(r.estimated).toBe(false);
  });

  it("descuenta salarios y usa precio 0 si falta", () => {
    const r = companyProfit({ dailyProductionRate: 10, item: bread, prices: {}, taxes, wageCostPerDay: 5 });
    expect(r.revenue).toBe(0);
    expect(r.wageCost).toBe(5);
    expect(r.netProfit).toBe(-5);
  });
});
