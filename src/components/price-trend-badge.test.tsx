// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PriceTrendBadge } from "./price-trend-badge";

describe("PriceTrendBadge", () => {
  it("muestra precio actual, promedio y etiqueta accesible", () => {
    render(<PriceTrendBadge price={{ current: 1.6, avg: 1.4, trend: "up" }} />);
    expect(screen.getByText("1.60")).toBeInTheDocument();
    expect(screen.getByText("(prom 1.40)")).toBeInTheDocument();
    expect(screen.getByText("Precio subiendo.")).toBeInTheDocument();
  });
});
