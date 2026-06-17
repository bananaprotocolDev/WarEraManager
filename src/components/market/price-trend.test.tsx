// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PriceTrend } from "./price-trend";

afterEach(() => vi.restoreAllMocks());

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

describe("PriceTrend", () => {
  it("muestra mensaje cuando hay menos de 2 puntos", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ item: "bread", points: [{ ts: 1000, price: 1.5 }] })),
    );
    render(wrap(<PriceTrend item="bread" />));
    expect(await screen.findByText(/Aún no hay suficientes datos/)).toBeInTheDocument();
  });
});
