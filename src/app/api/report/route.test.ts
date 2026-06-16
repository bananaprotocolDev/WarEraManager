import { describe, it, expect, vi, afterEach } from "vitest";

// Mockeamos el servicio para aislar el route handler.
vi.mock("@/server/portfolio", () => ({
  buildPortfolio: vi.fn(),
}));
import { buildPortfolio } from "@/server/portfolio";
import { GET } from "./route";

afterEach(() => vi.restoreAllMocks());

describe("GET /api/report", () => {
  it("400 si falta userId", async () => {
    const res = await GET(new Request("http://localhost/api/report"));
    expect(res.status).toBe(400);
  });

  it("devuelve el portfolio para un userId válido", async () => {
    (buildPortfolio as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      userId: "u1",
      companies: [],
      totalNetProfit: 0,
      wagesAvailable: false,
      estimated: true,
    });
    const res = await GET(new Request("http://localhost/api/report?userId=u1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe("u1");
  });

  it("pasa authenticated=true cuando hay X-API-Key", async () => {
    const mock = buildPortfolio as unknown as ReturnType<typeof vi.fn>;
    mock.mockResolvedValueOnce({ userId: "u1", companies: [], totalNetProfit: 0, wagesAvailable: true, estimated: true });
    await GET(new Request("http://localhost/api/report?userId=u1", { headers: { "X-API-Key": "tok" } }));
    expect(mock).toHaveBeenCalledWith(expect.anything(), { userId: "u1", authenticated: true });
  });
});
