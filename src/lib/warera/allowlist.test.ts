import { describe, it, expect } from "vitest";
import { isAllowedProc, isCacheableProc, ALLOWED_PROCS } from "./allowlist";

describe("allowlist", () => {
  it("permite procedimientos read-only conocidos", () => {
    expect(isAllowedProc("itemTrading.getPrices")).toBe(true);
    expect(isAllowedProc("company.getById")).toBe(true);
    expect(isAllowedProc("worker.getWorkers")).toBe(true);
  });

  it("rechaza procedimientos no listados", () => {
    expect(isAllowedProc("company.delete")).toBe(false);
    expect(isAllowedProc("admin.doStuff")).toBe(false);
    expect(isAllowedProc("")).toBe(false);
  });

  it("marca como cacheables solo los datos globales", () => {
    expect(isCacheableProc("itemTrading.getPrices")).toBe(true);
    expect(isCacheableProc("gameConfig.getGameConfig")).toBe(true);
    expect(isCacheableProc("company.getById")).toBe(false);
  });

  it("ALLOWED_PROCS no está vacío", () => {
    expect(ALLOWED_PROCS.size).toBeGreaterThan(0);
  });
});
