// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusDot } from "./status-dot";

describe("StatusDot", () => {
  it("expone una etiqueta accesible (no solo color)", () => {
    render(<StatusDot color="success" label="rentable" />);
    expect(screen.getByText("rentable")).toBeInTheDocument();
  });
});
