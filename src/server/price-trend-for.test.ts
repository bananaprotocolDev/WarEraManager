import { describe, it, expect } from "vitest";
import { priceTrendFor } from "./price-trend-for";

function store(points: { ts: number; price: number }[]) {
  return { getHistory: () => points, recordSnapshot: () => {}, listItems: () => [] };
}

describe("priceTrendFor", () => {
  it("sin store → undefined", () => {
    expect(priceTrendFor(undefined, "steel", { steel: 1.5 })).toBeUndefined();
  });
  it("sin histórico → undefined", () => {
    expect(priceTrendFor(store([]), "steel", { steel: 1.5 })).toBeUndefined();
  });
  it("con histórico → tendencia", () => {
    const r = priceTrendFor(store([{ ts: 1, price: 1.0 }, { ts: 2, price: 1.0 }]), "steel", { steel: 1.2 });
    expect(r?.trend).toBe("up");
    expect(r?.avg).toBeCloseTo(1.0);
  });
});
