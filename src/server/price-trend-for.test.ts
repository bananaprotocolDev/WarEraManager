import { describe, it, expect } from "vitest";
import { priceTrendFor } from "./price-trend-for";

function store(points: { ts: number; price: number }[]) {
  return { getHistory: async () => points, recordSnapshot: async () => {}, listItems: async () => [] };
}

describe("priceTrendFor", () => {
  it("sin store → undefined", async () => {
    expect(await priceTrendFor(undefined, "steel", { steel: 1.5 })).toBeUndefined();
  });
  it("sin histórico → undefined", async () => {
    expect(await priceTrendFor(store([]), "steel", { steel: 1.5 })).toBeUndefined();
  });
  it("con histórico → tendencia", async () => {
    const r = await priceTrendFor(store([{ ts: 1, price: 1.0 }, { ts: 2, price: 1.0 }]), "steel", { steel: 1.2 });
    expect(r?.trend).toBe("up");
    expect(r?.avg).toBeCloseTo(1.0);
  });
  it("si la DB falla → undefined (no-fatal)", async () => {
    const failing = {
      getHistory: async () => {
        throw new Error("neon down");
      },
      recordSnapshot: async () => {},
      listItems: async () => [],
    };
    expect(await priceTrendFor(failing, "steel", { steel: 1.5 })).toBeUndefined();
  });
});
