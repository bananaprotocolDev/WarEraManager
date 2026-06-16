import { describe, it, expect } from "vitest";
import { companyProfit } from "./profit";
import type { ItemDef, CompanyData, Taxes, PriceMap } from "./types";
import { GAME_CONSTANTS } from "../game-constants";

const bread: ItemDef = {
  code: "bread",
  type: "product",
  productionPoints: 1,
  productionNeeds: { grain: 2 }, // 2 de grano por unidad de pan
};

const company: CompanyData = {
  id: "c1",
  itemCode: "bread",
  production: 10, // factor 1 -> 10 unidades/día
  workerCount: 2,
  upgrades: { automatedEngine: 0, breakRoom: 0 },
};

const prices: PriceMap = { bread: 1.5, grain: 0.1 };
const taxes: Taxes = { income: 0, market: 10, selfWork: 0 }; // 10% market tax

describe("companyProfit", () => {
  it("calcula el desglose de beneficio neto/día", () => {
    const r = companyProfit({
      company,
      item: bread,
      workers: [{ wage: 1 }, { wage: 2 }],
      prices,
      taxes,
      constants: GAME_CONSTANTS,
    });
    // unidades/día = 10
    expect(r.unitsPerDay).toBe(10);
    // ingresos = 10 * 1.5 = 15
    expect(r.revenue).toBeCloseTo(15);
    // inputs = 10 unidades * 2 grano * 0.1 = 2
    expect(r.inputCost).toBeCloseTo(2);
    // salarios = 1 + 2 = 3
    expect(r.wageCost).toBe(3);
    // impuesto = 15 * 0.10 = 1.5
    expect(r.tax).toBeCloseTo(1.5);
    // neto = 15 - 2 - 3 - 1.5 = 8.5
    expect(r.netProfit).toBeCloseTo(8.5);
    // estimado porque las constantes no están calibradas
    expect(r.estimated).toBe(true);
  });

  it("usa precio 0 cuando un item no está en el mapa de precios", () => {
    const r = companyProfit({
      company,
      item: bread,
      workers: [],
      prices: {}, // sin precios
      taxes: { income: 0, market: 0, selfWork: 0 },
      constants: GAME_CONSTANTS,
    });
    expect(r.revenue).toBe(0);
    expect(r.inputCost).toBe(0);
    expect(r.netProfit).toBe(0);
  });
});
