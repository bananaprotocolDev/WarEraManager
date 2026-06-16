import { describe, it, expect, vi, afterEach } from "vitest";
import { RateLimiter } from "./rate-limit";

afterEach(() => vi.useRealTimers());

describe("RateLimiter", () => {
  it("permite hasta el límite y luego bloquea", () => {
    const rl = new RateLimiter(2, 1000);
    expect(rl.allow("ip1")).toBe(true);
    expect(rl.allow("ip1")).toBe(true);
    expect(rl.allow("ip1")).toBe(false);
  });

  it("reinicia la ventana tras el periodo", () => {
    vi.useFakeTimers();
    const rl = new RateLimiter(1, 1000);
    expect(rl.allow("ip1")).toBe(true);
    expect(rl.allow("ip1")).toBe(false);
    vi.advanceTimersByTime(1001);
    expect(rl.allow("ip1")).toBe(true);
  });

  it("cuenta por clave de forma independiente", () => {
    const rl = new RateLimiter(1, 1000);
    expect(rl.allow("a")).toBe(true);
    expect(rl.allow("b")).toBe(true);
    expect(rl.allow("a")).toBe(false);
  });
});
