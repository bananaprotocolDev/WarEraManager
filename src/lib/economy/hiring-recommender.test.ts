import { describe, it, expect } from "vitest";
import { hiringRecommendation } from "./hiring-recommender";
import { LABOR_CONSTANTS } from "./labor";

const base = {
  marginPerUnit: 1.3,
  unitValue: 1.3,
  inputCostPerUnit: 0,
  prodPoints: 1,
  maxWagePerPoint: 1.17,
  currentDailyRate: 72,
  freeSlots: 2,
  laborConstants: LABOR_CONSTANTS,
  market: { count: 5, medianWage: 0.5, medianMinProduction: 50, medianMinEnergy: 50 },
};

const market = (wage: number | null) => ({
  count: wage == null ? 0 : 3,
  medianWage: wage,
  medianMinProduction: 50,
  medianMinEnergy: 50,
});

describe("hiringRecommendation", () => {
  it("no viable si el margen es <= 0", () => {
    const r = hiringRecommendation({ ...base, marginPerUnit: -0.1, unitValue: 0, inputCostPerUnit: 0.1, prodPoints: 1, maxWagePerPoint: -0.1 });
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

describe("hiringRecommendation $/worker/day", () => {
  it("mercado caro (wage de mercado deja neto ≤ 0) → market_expensive", () => {
    const rec = hiringRecommendation({
      marginPerUnit: 0.0942, unitValue: 0.0942, inputCostPerUnit: 0, prodPoints: 1,
      maxWagePerPoint: 0.0942, currentDailyRate: 100, freeSlots: 2, sellPerDay: 1000,
      market: market(0.13), laborConstants: LABOR_CONSTANTS,
    });
    expect(rec.viable).toBe(false);
    expect(rec.reason).toBe("market_expensive");
    expect(rec.netPerWorkerPerDay).toBeLessThanOrEqual(0);
  });

  it("salario de mercado bajo → conviene, neto/día positivo", () => {
    const rec = hiringRecommendation({
      marginPerUnit: 0.0942, unitValue: 0.0942, inputCostPerUnit: 0, prodPoints: 1,
      maxWagePerPoint: 0.0942, currentDailyRate: 100, freeSlots: 2, sellPerDay: 100000,
      market: market(0.02), laborConstants: LABOR_CONSTANTS,
    });
    expect(rec.viable).toBe(true);
    expect(rec.reason).toBe("ok");
    expect(rec.netPerWorkerPerDay).toBeGreaterThan(0);
    expect(rec.marketWagePerDay).toBeGreaterThan(0);
    expect(rec.addsPerDay).toBeGreaterThan(0);
    expect(rec.marketDataAvailable).toBe(true);
  });

  it("ítem sin margen → item_unprofitable (antes que market_expensive)", () => {
    const rec = hiringRecommendation({
      marginPerUnit: -0.1, unitValue: 0, inputCostPerUnit: 0.1, prodPoints: 1,
      maxWagePerPoint: -0.1, currentDailyRate: 0, freeSlots: 2,
      market: market(0.01), laborConstants: LABOR_CONSTANTS,
    });
    expect(rec.viable).toBe(false);
    expect(rec.reason).toBe("item_unprofitable");
  });

  it("sin cupos → no_slots", () => {
    const rec = hiringRecommendation({
      marginPerUnit: 0.5, unitValue: 0.5, inputCostPerUnit: 0, prodPoints: 1,
      maxWagePerPoint: 0.5, currentDailyRate: 0, freeSlots: 0,
      market: market(0.01), laborConstants: LABOR_CONSTANTS,
    });
    expect(rec.reason).toBe("no_slots");
  });

  it("sin datos de mercado → marketDataAvailable false", () => {
    const rec = hiringRecommendation({
      marginPerUnit: 0.5, unitValue: 0.5, inputCostPerUnit: 0, prodPoints: 1,
      maxWagePerPoint: 0.5, currentDailyRate: 0, freeSlots: 2,
      market: market(null), laborConstants: LABOR_CONSTANTS,
    });
    expect(rec.marketDataAvailable).toBe(false);
  });
});
