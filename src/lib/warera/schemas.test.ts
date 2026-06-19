import { describe, it, expect } from "vitest";
import { trpcEnvelope, pricesSchema, companySchema, gameConfigSchema, userLiteSchema, transactionsPageSchema, workOffersPageSchema, countrySchema } from "./schemas";
import { gameConfigSchema as gcSchema2, companySchema as cSchema2 } from "./schemas";
import { workersSchema as wSchema2, userLiteSchema as ulSchema2 } from "./schemas";
import { companySchema as cSchema3, gameItemSchema as giSchema3 } from "./schemas";

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

describe("workOffersPageSchema", () => {
  it("parsea ofertas con wage/minEnergy/minProduction", () => {
    const p = workOffersPageSchema.parse({
      items: [{ wage: 0.153, minEnergy: 50, minProduction: 50, region: "r1", extra: 1 }],
      nextCursor: null,
    });
    expect(p.items[0].wage).toBeCloseTo(0.153);
    expect(p.items[0].minProduction).toBe(50);
  });
});

describe("company name/isFull/estimatedValue + item rarity", () => {
  it("companySchema parsea name, isFull, estimatedValue (con defaults)", () => {
    const c = cSchema3.parse({
      _id: "c1", itemCode: "steel", production: 5, workerCount: 0,
      activeUpgradeLevels: { automatedEngine: 4, breakRoom: 1, storage: 2 },
      name: "METALES PESADOS CORP", isFull: true, estimatedValue: 555.6,
    });
    expect(c.name).toBe("METALES PESADOS CORP");
    expect(c.isFull).toBe(true);
    expect(c.estimatedValue).toBeCloseTo(555.6);
    const c2 = cSchema3.parse({ _id: "c2", itemCode: "oil", production: 1, workerCount: 0, activeUpgradeLevels: {} });
    expect(c2.name).toBe("");
    expect(c2.isFull).toBe(false);
    expect(c2.estimatedValue).toBe(0);
  });
  it("gameItemSchema parsea rarity (default common)", () => {
    expect(giSchema3.parse({ type: "product", productionPoints: 10, productionNeeds: { iron: 10 }, rarity: "uncommon" }).rarity).toBe("uncommon");
    expect(giSchema3.parse({ type: "raw", productionPoints: 1 }).rarity).toBe("common");
  });
});

describe("countrySchema productionBonus", () => {
  it("deriva productionBonus = productionPercent/100", () => {
    const c = countrySchema.parse({
      taxes: { market: 10 },
      strategicResources: { bonuses: { productionPercent: 20 } },
    });
    expect(c.taxes.market).toBe(10);
    expect(c.productionBonus).toBeCloseTo(0.2);
  });
  it("sin strategicResources → productionBonus 0", () => {
    const c = countrySchema.parse({ taxes: {} });
    expect(c.productionBonus).toBe(0);
  });
});

describe("workers + userLite skills", () => {
  it("workersSchema trae user, wage y fidelity (default 0)", () => {
    const w = wSchema2.parse([{ user: "u1", wage: 0.5, fidelity: 3 }, { user: "u2", wage: 1 }]);
    expect(w[0]).toMatchObject({ user: "u1", wage: 0.5, fidelity: 3 });
    expect(w[1].fidelity).toBe(0);
  });
  it("workersSchema aplana la forma anidada {workersPerCompany:[{workers}]}", () => {
    const w = wSchema2.parse({
      workersPerCompany: [
        { company: { _id: "c1" }, workers: [{ user: "u1", wage: 0.5, fidelity: 2 }] },
        { company: { _id: "c2" }, workers: [{ user: "u2", wage: 0.3 }] },
      ],
    });
    expect(w).toHaveLength(2);
    expect(w[0]).toMatchObject({ user: "u1", wage: 0.5, fidelity: 2 });
    expect(w[1].user).toBe("u2");
  });
  it("workersSchema acepta la forma {workers:[...]}", () => {
    const w = wSchema2.parse({ workers: [{ user: "u1", wage: 1, fidelity: 0 }] });
    expect(w).toHaveLength(1);
  });
  it("workersSchema ante forma desconocida → []", () => {
    expect(wSchema2.parse({ algo: "raro" })).toEqual([]);
  });
  it("userLiteSchema parsea skills.production.value y energy.value", () => {
    const u = ulSchema2.parse({ _id: "u1", username: "x", skills: { production: { value: 25 }, energy: { value: 80 } } });
    expect(u.skills.production.value).toBe(25);
    expect(u.skills.energy.value).toBe(80);
  });
  it("userLiteSchema tolera skills ausentes (valores 0)", () => {
    const u = ulSchema2.parse({ _id: "u2", username: "y" });
    expect(u.skills.production.value).toBe(0);
    expect(u.skills.energy.value).toBe(0);
  });
});
