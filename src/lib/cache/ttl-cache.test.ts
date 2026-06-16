import { describe, it, expect, vi, afterEach } from "vitest";
import { TtlCache } from "./ttl-cache";

afterEach(() => vi.useRealTimers());

describe("TtlCache", () => {
  it("getOrLoad ejecuta el loader una vez y cachea", async () => {
    const cache = new TtlCache(1000);
    const loader = vi.fn().mockResolvedValue(42);
    expect(await cache.getOrLoad("k", loader)).toBe(42);
    expect(await cache.getOrLoad("k", loader)).toBe(42);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("recarga después de expirar el TTL", async () => {
    vi.useFakeTimers();
    const cache = new TtlCache(1000);
    const loader = vi.fn().mockResolvedValueOnce("a").mockResolvedValueOnce("b");
    expect(await cache.getOrLoad("k", loader)).toBe("a");
    vi.advanceTimersByTime(1001);
    expect(await cache.getOrLoad("k", loader)).toBe("b");
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("claves distintas se cachean por separado", async () => {
    const cache = new TtlCache(1000);
    expect(await cache.getOrLoad("a", async () => 1)).toBe(1);
    expect(await cache.getOrLoad("b", async () => 2)).toBe(2);
  });
});
