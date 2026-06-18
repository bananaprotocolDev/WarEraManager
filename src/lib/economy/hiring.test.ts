import { describe, it, expect } from "vitest";
import { maxWagePerPoint } from "./hiring";
import type { ItemDef, PriceMap, Taxes } from "./types";

const bread: ItemDef = { code: "bread", type: "product", productionPoints: 1, productionNeeds: { grain: 2 } };
const prices: PriceMap = { bread: 1.5, grain: 0.1 };

describe("maxWagePerPoint", () => {
  it("margen por unidad después de impuesto = precio - insumos, neto de impuesto", () => {
    const r = maxWagePerPoint(bread, prices, { income: 0, market: 10, selfWork: 0 });
    // margen bruto = 1.5 - (2*0.1) = 1.3 ; después de 10% = 1.17
    expect(r.marginPerUnit).toBeCloseTo(1.3);
    expect(r.maxWage).toBeCloseTo(1.17);
  });

  it("si el margen es negativo, maxWage también (no conviene producir)", () => {
    const r = maxWagePerPoint(bread, { bread: 0.1, grain: 0.1 }, { income: 0, market: 0, selfWork: 0 });
    // 0.1 - 0.2 = -0.1
    expect(r.marginPerUnit).toBeCloseTo(-0.1);
    expect(r.maxWage).toBeCloseTo(-0.1);
  });
});
