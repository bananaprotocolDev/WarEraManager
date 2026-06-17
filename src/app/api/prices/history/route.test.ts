import { describe, it, expect, vi, afterEach } from "vitest";
const getHistory = vi.fn();
vi.mock("@/lib/db/get-price-store", () => ({ getPriceStore: () => ({ getHistory }) }));
import { GET } from "./route";

afterEach(() => vi.restoreAllMocks());

describe("GET /api/prices/history", () => {
  it("400 si falta item", async () => {
    const res = await GET(new Request("http://localhost/api/prices/history"));
    expect(res.status).toBe(400);
  });

  it("devuelve los puntos del item", async () => {
    getHistory.mockReturnValueOnce([{ ts: 1000, price: 1.5 }]);
    const res = await GET(new Request("http://localhost/api/prices/history?item=bread"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.item).toBe("bread");
    expect(body.points).toEqual([{ ts: 1000, price: 1.5 }]);
  });
});
