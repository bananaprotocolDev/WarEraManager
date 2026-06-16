import { describe, it, expect } from "vitest";
import { trpcEnvelope, pricesSchema, companySchema, gameConfigSchema } from "./schemas";

describe("warera schemas", () => {
  it("desenvuelve la forma tRPC { result: { data } }", () => {
    const parsed = trpcEnvelope(pricesSchema).parse({
      result: { data: { grain: 0.075, bread: 1.77 } },
    });
    expect(parsed.grain).toBeCloseTo(0.075);
  });

  it("parsea una empresa tolerando campos extra", () => {
    const c = companySchema.parse({
      _id: "c1",
      itemCode: "bread",
      production: 10,
      workerCount: 2,
      activeUpgradeLevels: { automatedEngine: 1, breakRoom: 0 },
      extra: "ignorado",
    });
    expect(c.itemCode).toBe("bread");
    expect(c.activeUpgradeLevels.automatedEngine).toBe(1);
  });

  it("aplica default 0 a upgrades faltantes", () => {
    const c = companySchema.parse({
      _id: "c2",
      itemCode: "steel",
      production: 5,
      workerCount: 0,
      activeUpgradeLevels: { automatedEngine: 2 },
    });
    expect(c.activeUpgradeLevels.breakRoom).toBe(0);
  });
});

describe("gameConfigSchema", () => {
  it("extrae items con defaults tolerantes", () => {
    const gc = gameConfigSchema.parse({
      items: {
        bread: { type: "product", productionPoints: 1, productionNeeds: { grain: 2 } },
        grain: { type: "raw" },
        extraTop: "ignorado",
      },
    });
    expect(gc.items.bread.productionNeeds.grain).toBe(2);
    // grain sin productionPoints/needs → defaults
    expect(gc.items.grain.productionPoints).toBe(1);
    expect(gc.items.grain.productionNeeds).toEqual({});
  });
});
