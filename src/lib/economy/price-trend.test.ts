import { describe, it, expect } from "vitest";
import { averagePrice, priceTrend } from "./price-trend";

describe("price trend", () => {
  it("averagePrice promedia los precios de los puntos", () => {
    expect(averagePrice([{ ts: 1, price: 1 }, { ts: 2, price: 3 }])).toBeCloseTo(2);
    expect(averagePrice([])).toBeNull();
  });

  it("priceTrend clasifica con umbral 3%", () => {
    expect(priceTrend(1.1, 1.0).trend).toBe("up"); // +10%
    expect(priceTrend(0.9, 1.0).trend).toBe("down"); // -10%
    expect(priceTrend(1.01, 1.0).trend).toBe("flat"); // +1% < 3%
  });

  it("priceTrend devuelve current y avg", () => {
    const r = priceTrend(1.2, 1.0);
    expect(r.current).toBeCloseTo(1.2);
    expect(r.avg).toBeCloseTo(1.0);
  });
});
