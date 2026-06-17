import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
vi.mock("@/server/collect-prices", () => ({ collectPrices: vi.fn() }));
vi.mock("@/lib/db/get-price-store", () => ({ getPriceStore: vi.fn(() => ({})) }));
import { collectPrices } from "@/server/collect-prices";
import { GET } from "./route";

beforeEach(() => {
  delete process.env.CRON_SECRET;
});
afterEach(() => vi.clearAllMocks());

describe("GET /api/cron/collect-prices", () => {
  it("sin CRON_SECRET seteado, permite y recolecta", async () => {
    (collectPrices as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(5);
    const res = await GET(new Request("http://localhost/api/cron/collect-prices"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.collected).toBe(5);
  });

  it("con CRON_SECRET, rechaza sin Authorization correcto (401)", async () => {
    process.env.CRON_SECRET = "s3cr3t";
    const res = await GET(new Request("http://localhost/api/cron/collect-prices"));
    expect(res.status).toBe(401);
    expect(collectPrices).not.toHaveBeenCalled();
  });

  it("con CRON_SECRET y Authorization correcto, recolecta", async () => {
    process.env.CRON_SECRET = "s3cr3t";
    (collectPrices as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(3);
    const res = await GET(
      new Request("http://localhost/api/cron/collect-prices", {
        headers: { authorization: "Bearer s3cr3t" },
      }),
    );
    expect(res.status).toBe(200);
  });
});
