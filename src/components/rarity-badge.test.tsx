// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RarityBadge } from "./rarity-badge";

describe("RarityBadge", () => {
  it("muestra la etiqueta de la rareza conocida", () => {
    render(<RarityBadge rarity="uncommon" />);
    expect(screen.getByText("poco común")).toBeInTheDocument();
  });
  it("rareza desconocida → común", () => {
    render(<RarityBadge rarity="mistery" />);
    expect(screen.getByText("común")).toBeInTheDocument();
  });
});
