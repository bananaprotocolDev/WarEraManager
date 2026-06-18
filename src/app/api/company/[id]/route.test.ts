import { describe, it, expect, vi, afterEach } from "vitest";
vi.mock("@/server/company-detail", () => ({ buildCompanyDetail: vi.fn() }));
import { buildCompanyDetail } from "@/server/company-detail";
import { GET } from "./route";

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}
afterEach(() => vi.restoreAllMocks());

describe("GET /api/company/[id]", () => {
  it("400 si falta userId", async () => {
    const res = await GET(new Request("http://localhost/api/company/c1"), ctx("c1"));
    expect(res.status).toBe(400);
  });

  it("devuelve el detalle con userId y pasa authenticated según X-API-Key", async () => {
    const mock = buildCompanyDetail as unknown as ReturnType<typeof vi.fn>;
    mock.mockResolvedValueOnce({ id: "c1", itemCode: "bread" });
    const res = await GET(
      new Request("http://localhost/api/company/c1?userId=u1", { headers: { "X-API-Key": "tok" } }),
      ctx("c1"),
    );
    expect(res.status).toBe(200);
    expect(mock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ companyId: "c1", userId: "u1", authenticated: true }));
  });

  it("502 si el servicio falla", async () => {
    (buildCompanyDetail as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("upstream"));
    const res = await GET(new Request("http://localhost/api/company/c1?userId=u1"), ctx("c1"));
    expect(res.status).toBe(502);
  });
});
