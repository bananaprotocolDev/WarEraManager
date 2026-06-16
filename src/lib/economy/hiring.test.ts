import { describe, it, expect } from "vitest";
import { hiringAnalysis } from "./hiring";
import type { ItemDef, CompanyData, Taxes, PriceMap } from "./types";
import { GAME_CONSTANTS } from "../game-constants";

const bread: ItemDef = {
  code: "bread",
  type: "product",
  productionPoints: 1,
  productionNeeds: { grain: 2 },
};
const company: CompanyData = {
  id: "c1",
  itemCode: "bread",
  production: 12,
  workerCount: 3, // -> 4 unidades/día por trabajador marginal
  upgrades: { automatedEngine: 0, breakRoom: 0 },
};
const prices: PriceMap = { bread: 1.5, grain: 0.1 };
const taxes: Taxes = { income: 0, market: 0, selfWork: 0 };

describe("hiringAnalysis", () => {
  it("recomienda contratar si el valor marginal supera el salario pedido", () => {
    const r = hiringAnalysis({ company, item: bread, prices, taxes, candidateWage: 3, constants: GAME_CONSTANTS });
    // unidades marginales = 12/3 = 4
    expect(r.marginalUnitsPerDay).toBe(4);
    // valor marginal = 4*1.5 - (4*2*0.1) = 6 - 0.8 = 5.2
    expect(r.marginalValue).toBeCloseTo(5.2);
    expect(r.maxWage).toBeCloseTo(5.2);
    expect(r.worthIt).toBe(true);
  });

  it("no recomienda contratar si el salario supera el valor marginal", () => {
    const r = hiringAnalysis({ company, item: bread, prices, taxes, candidateWage: 6, constants: GAME_CONSTANTS });
    expect(r.worthIt).toBe(false);
  });

  it("aplica impuesto de mercado al valor marginal", () => {
    const taxedTaxes: Taxes = { income: 0, market: 10, selfWork: 0 };
    // marginalUnits = 12/3 = 4; marginalRevenue = 4*1.5 = 6
    // marginalInputCost = 4*2*0.1 = 0.8; marginalTax = 6*0.10 = 0.6
    // marginalValue = 6 - 0.8 - 0.6 = 4.6
    const r = hiringAnalysis({ company, item: bread, prices, taxes: taxedTaxes, candidateWage: 4, constants: GAME_CONSTANTS });
    expect(r.marginalValue).toBeCloseTo(4.6);
    expect(r.maxWage).toBeCloseTo(4.6);
    expect(r.worthIt).toBe(true); // candidateWage 4 < 4.6

    const r2 = hiringAnalysis({ company, item: bread, prices, taxes: taxedTaxes, candidateWage: 5, constants: GAME_CONSTANTS });
    expect(r2.worthIt).toBe(false); // candidateWage 5 > 4.6
  });
});
