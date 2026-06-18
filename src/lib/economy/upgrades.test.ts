import { describe, it, expect } from "vitest";
import { automationDailyProd, storageMax, maxWorkers } from "./upgrades";

const uc = {
  automatedEngine: { levels: { "1": { stats: { dailyProd: 24 } }, "3": { stats: { dailyProd: 72 } } } },
  storage: { levels: { "1": { stats: { maxProduction: 200 } }, "2": { stats: { maxProduction: 400 } } } },
  breakRoom: { levels: { "2": { stats: { maxWorkers: 4 } } } },
};

describe("upgrade helpers", () => {
  it("automationDailyProd por nivel", () => {
    expect(automationDailyProd(uc, 3)).toBe(72);
    expect(automationDailyProd(uc, 1)).toBe(24);
  });
  it("nivel 0 o desconocido → 0", () => {
    expect(automationDailyProd(uc, 0)).toBe(0);
    expect(automationDailyProd(uc, 9)).toBe(0);
    expect(automationDailyProd({}, 3)).toBe(0);
  });
  it("storageMax y maxWorkers", () => {
    expect(storageMax(uc, 2)).toBe(400);
    expect(maxWorkers(uc, 2)).toBe(4);
    expect(storageMax(uc, 0)).toBe(0);
  });
});
