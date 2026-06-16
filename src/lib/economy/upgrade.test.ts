import { describe, it, expect } from "vitest";
import { upgradeRoi } from "./upgrade";

describe("upgradeRoi", () => {
  it("calcula días de repago = costo / ganancia extra por día", () => {
    const r = upgradeRoi({ upgradeCost: 100, profitDeltaPerDay: 25 });
    expect(r.paybackDays).toBe(4);
    expect(r.worthIt).toBe(true);
  });

  it("devuelve Infinity y worthIt=false si la mejora no aumenta la ganancia", () => {
    const r = upgradeRoi({ upgradeCost: 100, profitDeltaPerDay: 0 });
    expect(r.paybackDays).toBe(Infinity);
    expect(r.worthIt).toBe(false);
  });

  it("respeta umbral personalizado maxPaybackDays", () => {
    // paybackDays = 100/5 = 20; con threshold 10 → worthIt false
    const r1 = upgradeRoi({ upgradeCost: 100, profitDeltaPerDay: 5, maxPaybackDays: 10 });
    expect(r1.paybackDays).toBe(20);
    expect(r1.worthIt).toBe(false);

    // con threshold 25 → worthIt true (20 <= 25)
    const r2 = upgradeRoi({ upgradeCost: 100, profitDeltaPerDay: 5, maxPaybackDays: 25 });
    expect(r2.paybackDays).toBe(20);
    expect(r2.worthIt).toBe(true);
  });

  it("devuelve Infinity y worthIt=false si profitDeltaPerDay es negativo", () => {
    const r = upgradeRoi({ upgradeCost: 100, profitDeltaPerDay: -5 });
    expect(r.paybackDays).toBe(Infinity);
    expect(r.worthIt).toBe(false);
  });
});
