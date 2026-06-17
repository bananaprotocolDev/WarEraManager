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
    profit: { unitsPerDay: 10, revenue: 15, inputCost: 2, wageCost: 3, tax: 1.5, netProfit: net, estimated: true },
    hiring: { marginalUnitsPerDay: 4, marginalValue: 5, maxWage: 5, worthIt: true, estimated: true },
    maxWageToHire: 5,
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
