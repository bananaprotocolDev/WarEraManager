// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HiringPanel } from "./hiring-panel";

const base = {
  viable: true, reason: "ok" as const, maxWagePerPoint: 0.09, suggestedWage: 0.05,
  freeSlots: 2, demandKnown: true, recommendedProfile: { minProduction: 50, minEnergy: 50, minLevel: 14 },
  expectedDailyGain: 1, addsPerDay: 3, marketWagePerDay: 1, netPerWorkerPerDay: 2, marketDataAvailable: true,
};

describe("HiringPanel", () => {
  it("muestra neto/trabajador/día y el veredicto conviene", () => {
    render(<HiringPanel hiring={base} chain={null} />);
    expect(screen.getByText(/Conviene contratar/i)).toBeInTheDocument();
    expect(screen.getByText(/trabajador\/día/i)).toBeInTheDocument();
  });

  it("muestra motivo mercado caro cuando no conviene por salario", () => {
    render(<HiringPanel hiring={{ ...base, viable: false, reason: "market_expensive", netPerWorkerPerDay: -1 }} chain={null} />);
    expect(screen.getByText(/No conviene/i)).toBeInTheDocument();
    expect(screen.getAllByText(/mercado/i).length).toBeGreaterThanOrEqual(1);
  });

  it("muestra aviso cuando faltan datos de mercado laboral", () => {
    render(<HiringPanel hiring={{ ...base, marketDataAvailable: false }} chain={null} />);
    expect(screen.getByText(/datos de mercado/i)).toBeInTheDocument();
  });

  it("muestra la línea de cadena cuando pertenece a una", () => {
    render(
      <HiringPanel
        hiring={base}
        chain={{ steps: ["petroleum", "oil"], netPerDay: -2.5, bestRawDestination: "sell", measured: false }}
      />,
    );
    expect(screen.getByText(/petroleum/)).toBeInTheDocument();
    expect(screen.getByText(/oil/)).toBeInTheDocument();
  });
});
