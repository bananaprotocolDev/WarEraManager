import { describe, it, expect } from "vitest";
import { detectChains, chainNetPerDay, type ChainCompany } from "./chain";
import type { ItemDef } from "./types";

const raw = (code: string): ItemDef => ({ code, type: "raw", productionPoints: 1, productionNeeds: {} });
const product = (code: string, needs: Record<string, number>, pp = 1): ItemDef => ({
  code, type: "product", productionPoints: pp, productionNeeds: needs,
});

const cc = (over: Partial<ChainCompany> & { itemCode: string; item: ItemDef }): ChainCompany => ({
  id: over.itemCode, dailyProductionRate: 0, wageCostPerDay: 0, ...over,
});

describe("detectChains", () => {
  it("arma cadenas donde el usuario tiene raw y producto", () => {
    const companies = [
      cc({ itemCode: "petroleum", item: raw("petroleum") }),
      cc({ itemCode: "oil", item: product("oil", { petroleum: 1 }) }),
      cc({ itemCode: "iron", item: raw("iron") }),
      cc({ itemCode: "steel", item: product("steel", { iron: 10 }, 10) }),
    ];
    const chains = detectChains(companies);
    expect(chains.map((c) => c.steps)).toEqual([
      ["petroleum", "oil"],
      ["iron", "steel"],
    ]);
  });

  it("no arma cadena si falta un extremo", () => {
    const companies = [cc({ itemCode: "oil", item: product("oil", { petroleum: 1 }) })];
    expect(detectChains(companies)).toEqual([]);
  });
});

describe("chainNetPerDay", () => {
  const taxes = { income: 4, market: 1, selfWork: 4 };
  const chain = {
    steps: ["petroleum", "oil"],
    companies: [
      cc({ itemCode: "petroleum", item: raw("petroleum"), dailyProductionRate: 100, wageCostPerDay: 5 }),
      cc({ itemCode: "oil", item: product("oil", { petroleum: 1 }), dailyProductionRate: 100, wageCostPerDay: 4 }),
    ],
  };

  it("ingreso del final neto − todos los sueldos − insumos comprados", () => {
    const net = chainNetPerDay({ chain, prices: { oil: 0.1775 }, taxes, measured: true, rawDestination: "sell" });
    expect(net.netPerDay).toBeCloseTo(100 * 0.1775 * 0.99 - 9, 4);
    expect(net.measured).toBe(true);
    expect(net.bestRawDestination).toBe("sell");
    expect(net.steps).toEqual(["petroleum", "oil"]);
  });

  it("descuenta insumos del final que NO se autoabastecen", () => {
    const chain2 = {
      steps: ["petroleum", "oil"],
      companies: [
        cc({ itemCode: "petroleum", item: raw("petroleum"), dailyProductionRate: 100, wageCostPerDay: 0 }),
        cc({ itemCode: "oil", item: product("oil", { petroleum: 1, additive: 2 }), dailyProductionRate: 100, wageCostPerDay: 0 }),
      ],
    };
    const net = chainNetPerDay({ chain: chain2, prices: { oil: 0.5, additive: 0.1 }, taxes, measured: false, rawDestination: "process" });
    expect(net.netPerDay).toBeCloseTo(49.5 - 20, 4);
  });
});
