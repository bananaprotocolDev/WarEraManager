// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { runCalibrate } from "./use-calibrate";

afterEach(() => vi.restoreAllMocks());

describe("runCalibrate", () => {
  it("llama /api/calibrate con userId, days y X-API-Key", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, factor: 0.9, samples: 3, rows: [] })),
    );
    const r = await runCalibrate("u1", "tok", 7);
    expect(r.ok).toBe(true);
    const [url, opts] = spy.mock.calls[0];
    expect(url).toBe("/api/calibrate?userId=u1&days=7");
    expect((opts?.headers as Record<string, string>)["X-API-Key"]).toBe("tok");
  });

  it("lanza si no es ok", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("e", { status: 502 }));
    await expect(runCalibrate("u1", "tok", 7)).rejects.toThrow();
  });
});
