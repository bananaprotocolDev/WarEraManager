import { describe, it, expect, vi, afterEach } from "vitest";
vi.mock("@/server/optimizer", () => ({ buildOptimizer: vi.fn() }));
import { buildOptimizer } from "@/server/optimizer";
import { GET } from "./route";

afterEach(() => vi.restoreAllMocks());

describe("GET /api/optimizer", () => {
  it("devuelve el ranking", async () => {
    (buildOptimizer as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      options: [{ itemCode: "bread", marginPerPoint: 1.3 }],
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.options[0].itemCode).toBe("bread");
  });

  it("502 si el servicio falla", async () => {
    (buildOptimizer as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("HTTP 500"));
    const res = await GET();
    expect(res.status).toBe(502);
  });
});
