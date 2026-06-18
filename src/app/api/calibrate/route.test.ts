import { describe, it, expect, vi, afterEach } from "vitest";
vi.mock("@/server/calibrate", () => ({ runCalibration: vi.fn() }));
vi.mock("@/lib/db/get-calibration-store", () => ({ getCalibrationStore: vi.fn(() => ({})) }));
import { runCalibration } from "@/server/calibrate";
import { GET } from "./route";

afterEach(() => vi.clearAllMocks());

describe("GET /api/calibrate", () => {
  it("400 si falta userId", async () => {
    const res = await GET(new Request("http://localhost/api/calibrate", { headers: { "X-API-Key": "tok" } }));
    expect(res.status).toBe(400);
  });

  it("401 si falta token", async () => {
    const res = await GET(new Request("http://localhost/api/calibrate?userId=u1"));
    expect(res.status).toBe(401);
    expect(runCalibration).not.toHaveBeenCalled();
  });

  it("con token y userId, corre la calibración", async () => {
    (runCalibration as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, factor: 0.9, samples: 4, rows: [] });
    const res = await GET(new Request("http://localhost/api/calibrate?userId=u1&days=7", { headers: { "X-API-Key": "tok" } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.factor).toBeCloseTo(0.9);
  });
});
