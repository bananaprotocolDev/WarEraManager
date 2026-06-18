import { describe, it, expect } from "vitest";
import { hiringRecommendation } from "./hiring-recommender";
import { LABOR_CONSTANTS } from "./labor";

const base = {
  marginPerUnit: 1.3,
  maxWagePerPoint: 1.17,
  currentDailyRate: 72,
  freeSlots: 2,
  laborConstants: LABOR_CONSTANTS,
  market: { count: 5, medianWage: 0.5, medianMinProduction: 50, medianMinEnergy: 50 },
};

describe("hiringRecommendation", () => {
  it("no viable si el margen es <= 0", () => {
    const r = hiringRecommendation({ ...base, marginPerUnit: -0.1, maxWagePerPoint: -0.1 });
    expect(r.viable).toBe(false);
    expect(r.reason).toBe("item_unprofitable");
  });

  it("no viable si no hay slots libres", () => {
    const r = hiringRecommendation({ ...base, freeSlots: 0 });
    expect(r.viable).toBe(false);
    expect(r.reason).toBe("no_slots");
  });

  it("no viable si la venta no supera la producción actual (sin demanda)", () => {
    const r = hiringRecommendation({ ...base, sellPerDay: 60 }); // vende 60 < produce 72
    expect(r.viable).toBe(false);
    expect(r.reason).toBe("no_demand");
  });

  it("viable con demanda: salario máx, salario sugerido ≤ máx y perfil del mercado", () => {
    const r = hiringRecommendation({ ...base, sellPerDay: 200 }); // headroom 128
    expect(r.viable).toBe(true);
    expect(r.demandKnown).toBe(true);
    expect(r.maxWagePerPoint).toBeCloseTo(1.17);
    expect(r.suggestedWage).toBeLessThanOrEqual(1.17);
    expect(r.suggestedWage).toBeGreaterThan(0);
    expect(r.recommendedProfile.minProduction).toBeGreaterThan(0);
    expect(r.recommendedProfile.minEnergy).toBeGreaterThan(0);
    expect(r.recommendedProfile.minLevel).toBeGreaterThanOrEqual(0);
    expect(r.expectedDailyGain).toBeGreaterThan(0);
  });

  it("sin venta (sin token): viable pero marcado como supuesto", () => {
    const r = hiringRecommendation({ ...base }); // sin sellPerDay
    expect(r.viable).toBe(true);
    expect(r.demandKnown).toBe(false);
  });
});
