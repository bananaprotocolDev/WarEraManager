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
    const res = await GET(new Request("http://localhost/api/optimizer"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.options[0].itemCode).toBe("bread");
  });
});
