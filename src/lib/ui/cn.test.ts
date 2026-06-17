import { describe, it, expect } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("une clases y resuelve conflictos de tailwind-merge", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("text-sm", false && "hidden", "font-bold")).toBe("text-sm font-bold");
  });
});
