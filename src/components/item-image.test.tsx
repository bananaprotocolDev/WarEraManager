// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ItemImage, itemImageUrl } from "./item-image";

describe("ItemImage", () => {
  it("itemImageUrl arma la URL del item", () => {
    expect(itemImageUrl("steel")).toBe("https://app.warera.io/images/items/steel.png");
  });
  it("renderiza la imagen con alt = code", () => {
    render(<ItemImage code="steel" />);
    const img = screen.getByAltText("steel") as HTMLImageElement;
    expect(img.src).toContain("/images/items/steel.png");
  });
  it("cae al fallback cuando la imagen falla", () => {
    render(<ItemImage code="nope" />);
    const img = screen.getByAltText("nope");
    fireEvent.error(img);
    expect(screen.queryByAltText("nope")).toBeNull(); // ya no hay img; muestra el fallback
  });
});
