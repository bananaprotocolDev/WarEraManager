import { describe, it, expect } from "vitest";
import { companyStatus } from "./company-status";

describe("companyStatus", () => {
  it("rojo si pierde dinero", () => {
    expect(companyStatus(-3.1).level).toBe("loss");
  });
  it("ámbar si gana poco (<= 5/día)", () => {
    expect(companyStatus(4).level).toBe("low");
  });
  it("verde si gana bien (> 5/día)", () => {
    expect(companyStatus(28.4).level).toBe("good");
  });
  it("expone un token de color por nivel", () => {
    expect(companyStatus(28).color).toBe("success");
    expect(companyStatus(4).color).toBe("warning");
    expect(companyStatus(-1).color).toBe("destructive");
  });
});
