import { describe, it, expect } from "vitest";
import { assembleCompanyReport } from "./company-report";
import type { ItemDef, Taxes, PriceMap } from "@/lib/economy";

const bread: ItemDef = { code: "bread", type: "product", productionPoints: 1, productionNeeds: { grain: 2 } };
const company = { id: "c1", itemCode: "bread", production: 10, workerCount: 2, upgrades: { automatedEngine: 0, breakRoom: 0 } };
const prices: PriceMap = { bread: 1.5, grain: 0.1 };
const taxes: Taxes = { income: 0, market: 10, selfWork: 0 };

describe("assembleCompanyReport", () => {
  it("arma profit + hiring + maxWageToHire", () => {
    const r = assembleCompanyReport({ company, item: bread, workers: [{ wage: 1 }, { wage: 2 }], prices, taxes });
    expect(r.id).toBe("c1");
    expect(r.itemCode).toBe("bread");
    expect(r.profit.netProfit).toBeCloseTo(8.5);
    expect(r.maxWageToHire).toBeCloseTo(r.hiring.maxWage);
  });
});
