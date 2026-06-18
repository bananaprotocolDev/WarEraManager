import { describe, it, expect } from "vitest";
import { PostgresCalibrationStore } from "./calibration-store";

function fakeSql(resultFor: (q: string) => Record<string, unknown>[] = () => []) {
  const queries: string[] = [];
  const sql = async (strings: TemplateStringsArray) => {
    queries.push(strings.join("?"));
    return resultFor(strings.join("?"));
  };
  return { sql: sql as never, queries };
}

describe("PostgresCalibrationStore", () => {
  it("get devuelve null cuando no hay fila", async () => {
    const { sql } = fakeSql(() => []);
    expect(await new PostgresCalibrationStore(sql).get()).toBeNull();
  });

  it("get mapea la fila a Calibration", async () => {
    const { sql } = fakeSql((q) => (q.includes("SELECT") ? [{ factor: "0.5", samples: "3", updated_at: "1000" }] : []));
    const c = await new PostgresCalibrationStore(sql).get();
    expect(c).toEqual({ factor: 0.5, samples: 3, updatedAt: 1000 });
  });

  it("set emite un upsert", async () => {
    const { sql, queries } = fakeSql();
    await new PostgresCalibrationStore(sql).set({ factor: 0.9, samples: 5, updatedAt: 2000 });
    expect(queries.some((q) => /INSERT INTO calibration/i.test(q) && /ON CONFLICT/i.test(q))).toBe(true);
  });
});
