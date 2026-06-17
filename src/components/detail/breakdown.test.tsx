// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Breakdown } from "./breakdown";

describe("Breakdown", () => {
  it("muestra ingresos y neto", () => {
    render(
      <Breakdown
        profit={{ unitsPerDay: 10, revenue: 15, inputCost: 2, wageCost: 3, tax: 1.5, netProfit: 8.5, estimated: true }}
      />,
    );
    expect(screen.getByText("Ingresos")).toBeInTheDocument();
    expect(screen.getByText("+8.50 /día")).toBeInTheDocument();
  });
});
