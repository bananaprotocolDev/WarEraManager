// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChainsCard } from "./chains-card";

describe("ChainsCard", () => {
  it("no renderiza nada sin cadenas", () => {
    const { container } = render(<ChainsCard chains={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("muestra una fila por cadena con neto y mejor destino", () => {
    render(
      <ChainsCard
        chains={[{ steps: ["petroleum", "oil"], netPerDay: -2.5, bestRawDestination: "sell", measured: false }]}
      />,
    );
    expect(screen.getByText(/petroleum→oil/)).toBeInTheDocument();
    expect(screen.getByText(/vender/)).toBeInTheDocument();
  });
});
