// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CompanyCard } from "./company-card";
import type { CompanyReport } from "@/server/portfolio";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

function report(net: number): CompanyReport {
  return {
    id: "c1",
    itemCode: "bread",
    profit: { dailyProductionRate: 72, usefulRate: 72, revenue: 108, inputCost: 14.4, wageCost: 3, tax: 10.8, netProfit: net, sellAssumed: true, estimated: true },
    maxWageToHire: 1.17,
    marginPerUnit: 1.3,
    stock: 50,
    storageMax: 200,
    dailyProductionRate: 72,
  };
}

describe("CompanyCard", () => {
  it("muestra beneficio positivo y estado rentable", () => {
    render(<CompanyCard company={report(28.4)} />);
    expect(screen.getByText("bread")).toBeInTheDocument();
    expect(screen.getByText("+28.40 /día")).toBeInTheDocument();
    expect(screen.getAllByText("rentable").length).toBeGreaterThan(0);
  });

  it("muestra pérdida con signo negativo", () => {
    render(<CompanyCard company={report(-3.1)} />);
    expect(screen.getByText("-3.10 /día")).toBeInTheDocument();
  });
});
