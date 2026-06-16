import { describe, it, expect } from "vitest";
import { toItemDef } from "./item-def";

describe("toItemDef", () => {
  it("mapea un item de gameConfig a ItemDef con type válido", () => {
    const d = toItemDef("bread", { type: "product", productionPoints: 1, productionNeeds: { grain: 2 } });
    expect(d).toEqual({ code: "bread", type: "product", productionPoints: 1, productionNeeds: { grain: 2 } });
  });

  it("usa 'product' cuando el type es desconocido", () => {
    const d = toItemDef("weird", { type: "mystery", productionPoints: 3, productionNeeds: {} });
    expect(d.type).toBe("product");
  });

  it("aplica defaults para campos faltantes", () => {
    const d = toItemDef("x", { type: "raw", productionPoints: 1, productionNeeds: {} });
    expect(d.type).toBe("raw");
    expect(d.productionNeeds).toEqual({});
  });
});
