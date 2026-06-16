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
});
