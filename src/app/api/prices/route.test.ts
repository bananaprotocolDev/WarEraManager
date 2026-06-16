import { describe, it, expect, vi, afterEach } from "vitest";

const getPrices = vi.fn();
vi.mock("@/lib/warera/client", () => ({
  WareraClient: vi.fn().mockImplementation(function () {
    return { getPrices };
  }),
}));
import { GET } from "./route";

afterEach(() => vi.restoreAllMocks());

describe("GET /api/prices", () => {
  it("devuelve el mapa de precios", async () => {
    getPrices.mockResolvedValueOnce({ grain: 0.1, bread: 1.5 });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.bread).toBe(1.5);
  });

  it("502 si el upstream falla", async () => {
    getPrices.mockRejectedValueOnce(new Error("HTTP 500"));
    const res = await GET();
    expect(res.status).toBe(502);
  });
});
