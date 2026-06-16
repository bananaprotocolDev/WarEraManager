import { describe, it, expect } from "vitest";
import { buildOptimizer } from "./optimizer";

function fakeClient() {
  return {
    getPrices: async () => ({ bread: 1.5, grain: 0.1, steel: 1.6, limestone: 0.08 }),
    getGameConfig: async () => ({
      items: {
        bread: { type: "product", productionPoints: 1, productionNeeds: { grain: 2 } },
        steel: { type: "product", productionPoints: 2, productionNeeds: { limestone: 1 } },
        grain: { type: "raw", productionPoints: 1, productionNeeds: {} },
      },
    }),
  } as never;
}

describe("buildOptimizer", () => {
  it("rankea por margen por punto de producción", async () => {
    const r = await buildOptimizer(fakeClient());
    expect(r.options[0].itemCode).toBe("bread"); // 1.3 > steel 0.76 > grain 0.1
    expect(r.options[0].marginPerPoint).toBeCloseTo(1.3);
  });
});
