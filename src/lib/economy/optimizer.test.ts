import { describe, it, expect } from "vitest";
import { productionOptimizer } from "./optimizer";
import type { ItemDef, PriceMap } from "./types";

const items: ItemDef[] = [
  { code: "bread", type: "product", productionPoints: 1, productionNeeds: { grain: 2 } },
  { code: "steel", type: "product", productionPoints: 2, productionNeeds: { limestone: 1 } },
  { code: "rifle", type: "equipment", productionPoints: 5, productionNeeds: {} },
];
const prices: PriceMap = { bread: 1.5, grain: 0.1, steel: 1.6, limestone: 0.08, rifle: 10 };

describe("productionOptimizer", () => {
  it("rankea items por margen por punto de producción, descendente", () => {
    const r = productionOptimizer({ items, prices });
    // bread: (1.5 - 2*0.1)/1 = 1.3
    // steel: (1.6 - 1*0.08)/2 = 0.76
    // rifle no es product/raw -> excluido
    expect(r.map((o) => o.itemCode)).toEqual(["bread", "steel"]);
    expect(r[0].marginPerPoint).toBeCloseTo(1.3);
    expect(r[1].marginPerPoint).toBeCloseTo(0.76);
  });

  it("excluye items sin precio de venta", () => {
    const r = productionOptimizer({ items, prices: { grain: 0.1, limestone: 0.08 } });
    expect(r).toEqual([]);
  });
});
