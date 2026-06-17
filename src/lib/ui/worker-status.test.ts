import { describe, it, expect } from "vitest";
import { isOverpaid } from "./worker-status";

describe("isOverpaid", () => {
  it("true si el salario supera el valor marginal máximo", () => {
    expect(isOverpaid(6, 5)).toBe(true);
  });
  it("false si el salario es menor o igual", () => {
    expect(isOverpaid(5, 5)).toBe(false);
    expect(isOverpaid(3, 5)).toBe(false);
  });
});
