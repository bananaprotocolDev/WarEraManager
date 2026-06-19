import { describe, it, expect } from "vitest";
import { bestDestinationValue, maxWagePerPointFromValue } from "./item-value";
import type { ItemDef } from "./types";

const taxes = { income: 4, market: 1, selfWork: 4 };
const raw = (code: string): ItemDef => ({ code, type: "raw", productionPoints: 1, productionNeeds: {} });
const product = (code: string, needs: Record<string, number>, pp = 1): ItemDef => ({
  code, type: "product", productionPoints: pp, productionNeeds: needs,
});

describe("bestDestinationValue", () => {
  it("sin downstream propio → vale su venta neta", () => {
    const v = bestDestinationValue({ item: raw("iron"), prices: { iron: 0.08 }, taxes });
    expect(v.destination).toBe("sell");
    expect(v.processValue).toBeNull();
    expect(v.unitValue).toBeCloseTo(0.08 * 0.99, 6);
  });

  it("petróleo a precios actuales → mejor destino vender (procesar rinde menos)", () => {
    const v = bestDestinationValue({
      item: raw("petroleum"),
      prices: { petroleum: 0.0951, oil: 0.1775 },
      taxes,
      downstream: { item: product("oil", { petroleum: 1 }, 1) },
      marketWagePerPoint: 0.13,
    });
    expect(v.destination).toBe("sell");
    expect(v.processValue).toBeCloseTo((0.1775 * 0.99 - 0.13) / 1, 4);
    expect(v.unitValue).toBeCloseTo(0.0951 * 0.99, 4);
  });

  it("cuando procesar rinde más → destino process", () => {
    const v = bestDestinationValue({
      item: raw("petroleum"),
      prices: { petroleum: 0.05, oil: 0.5 },
      taxes,
      downstream: { item: product("oil", { petroleum: 1 }, 1) },
      marketWagePerPoint: 0.02,
    });
    expect(v.destination).toBe("process");
    expect(v.unitValue).toBeCloseTo((0.5 * 0.99 - 0.02) / 1, 4);
  });

  it("descuenta otros insumos comprados del downstream", () => {
    const v = bestDestinationValue({
      item: raw("petroleum"),
      prices: { petroleum: 0.05, oil: 0.5, additive: 0.1 },
      taxes,
      downstream: { item: product("oil", { petroleum: 1, additive: 1 }, 1) },
      marketWagePerPoint: 0,
    });
    expect(v.processValue).toBeCloseTo(0.5 * 0.99 - 0.1, 4);
  });

  it("downstream que no consume este ítem → processValue null, destino sell", () => {
    const v = bestDestinationValue({
      item: raw("iron"),
      prices: { iron: 0.08, steel: 0.5 },
      taxes,
      downstream: { item: product("steel", { coal: 2 }, 1) },
    });
    expect(v.processValue).toBeNull();
    expect(v.destination).toBe("sell");
  });

  it("downstream null explícito → processValue null", () => {
    const v = bestDestinationValue({ item: raw("iron"), prices: { iron: 0.08 }, taxes, downstream: null });
    expect(v.processValue).toBeNull();
    expect(v.destination).toBe("sell");
  });
});

describe("maxWagePerPointFromValue", () => {
  it("= (unitValue - insumo) / prodPoints", () => {
    expect(maxWagePerPointFromValue(1.573, 0.805, 10)).toBeCloseTo((1.573 - 0.805) / 10, 6);
  });
  it("prodPoints 0 → 0", () => {
    expect(maxWagePerPointFromValue(1, 0, 0)).toBe(0);
  });
});
