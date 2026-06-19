// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HiringPanel } from "./hiring-panel";

describe("HiringPanel", () => {
  it("muestra el perfil y salarios cuando conviene", () => {
    render(
      <HiringPanel
        hiring={{
          viable: true, reason: "ok", maxWagePerPoint: 1.17, suggestedWage: 0.5, freeSlots: 2,
          demandKnown: true, marketDataAvailable: true,
          recommendedProfile: { minProduction: 50, minEnergy: 50, minLevel: 14 },
          expectedDailyGain: 80, addsPerDay: 10, marketWagePerDay: 5, netPerWorkerPerDay: 5,
        }}
      />,
    );
    expect(screen.getByText("Conviene contratar")).toBeInTheDocument();
    expect(screen.getByText("min producción: 50")).toBeInTheDocument();
  });

  it("muestra el motivo cuando no conviene", () => {
    render(
      <HiringPanel
        hiring={{
          viable: false, reason: "no_demand", maxWagePerPoint: 1.17, suggestedWage: 0, freeSlots: 2,
          demandKnown: true, marketDataAvailable: false,
          recommendedProfile: { minProduction: 0, minEnergy: 0, minLevel: 0 },
          expectedDailyGain: 0, addsPerDay: 0, marketWagePerDay: 0, netPerWorkerPerDay: 0,
        }}
      />,
    );
    expect(screen.getByText("No conviene")).toBeInTheDocument();
    expect(screen.getByText(/llenaría el almacén/)).toBeInTheDocument();
  });
});
