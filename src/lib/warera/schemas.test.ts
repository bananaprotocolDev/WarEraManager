import { describe, it, expect } from "vitest";
import { trpcEnvelope, pricesSchema, companySchema, gameConfigSchema, userLiteSchema, transactionsPageSchema } from "./schemas";
import { gameConfigSchema as gcSchema2, companySchema as cSchema2 } from "./schemas";

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

describe("userLiteSchema", () => {
  it("parsea id, username y country tolerando extras", () => {
    const u = userLiteSchema.parse({
      _id: "u1",
      username: "majima",
      country: "co1",
      skills: { production: { level: 3 } },
    });
    expect(u._id).toBe("u1");
    expect(u.country).toBe("co1");
  });

  it("acepta country ausente", () => {
    const u = userLiteSchema.parse({ _id: "u2", username: "x" });
    expect(u.country).toBeUndefined();
  });
});

describe("upgradesConfig + storage", () => {
  it("parsea upgradesConfig con niveles y stats", () => {
    const gc = gcSchema2.parse({
      items: {},
      upgradesConfig: {
        automatedEngine: { levels: { "1": { stats: { dailyProd: 24 } }, "3": { stats: { dailyProd: 72 } } } },
        storage: { levels: { "1": { stats: { maxProduction: 200 } } } },
        breakRoom: { levels: { "2": { stats: { maxWorkers: 4, dailyHires: 4 } } } },
      },
    });
    expect(gc.upgradesConfig.automatedEngine?.levels["3"].stats.dailyProd).toBe(72);
    expect(gc.upgradesConfig.storage?.levels["1"].stats.maxProduction).toBe(200);
  });

  it("company incluye storage en activeUpgradeLevels (default 0)", () => {
    const c = cSchema2.parse({
      _id: "c1",
      itemCode: "steel",
      production: 191,
      workerCount: 0,
      activeUpgradeLevels: { automatedEngine: 3, breakRoom: 1 },
    });
    expect(c.activeUpgradeLevels.storage).toBe(0);
    const c2 = cSchema2.parse({
      _id: "c2", itemCode: "oil", production: 8, workerCount: 1,
      activeUpgradeLevels: { automatedEngine: 5, breakRoom: 1, storage: 2 },
    });
    expect(c2.activeUpgradeLevels.storage).toBe(2);
  });
});

describe("transactionsPageSchema", () => {
  it("parsea items con campos de venta y nextCursor", () => {
    const p = transactionsPageSchema.parse({
      items: [{ sellerId: "u1", money: 10, quantity: 5, createdAt: "2026-06-17T00:00:00.000Z", extra: 1 }],
      nextCursor: "abc",
    });
    expect(p.items[0].sellerId).toBe("u1");
    expect(p.items[0].quantity).toBe(5);
    expect(p.nextCursor).toBe("abc");
  });

  it("tolera items vacíos y sin cursor", () => {
    const p = transactionsPageSchema.parse({ items: [] });
    expect(p.items).toEqual([]);
  });
});
