import { describe, it, expect } from "vitest";
import { companyWorkerOutput } from "./worker-output";
import { LABOR_CONSTANTS, workerUnitsPerDay } from "@/lib/economy";

function client(usersById: Record<string, { production: number; energy: number }>) {
  return {
    getUserLite: async (id: string) => ({
      _id: id,
      username: id,
      skills: { production: { value: usersById[id].production }, energy: { value: usersById[id].energy } },
    }),
  } as never;
}

describe("companyWorkerOutput", () => {
  it("suma el aporte de cada trabajador (skills + fidelidad)", async () => {
    const workers = [
      { user: "a", wage: 0.5, fidelity: 0 },
      { user: "b", wage: 0.5, fidelity: 10 },
    ];
    const c = client({ a: { production: 40, energy: 50 }, b: { production: 40, energy: 50 } });
    const total = await companyWorkerOutput(c, workers, LABOR_CONSTANTS);
    const expected =
      workerUnitsPerDay(40, 50, 0, LABOR_CONSTANTS) + workerUnitsPerDay(40, 50, 10, LABOR_CONSTANTS);
    expect(total).toBeCloseTo(expected); // 480 + 528 = 1008
  });

  it("trabajadores sin user se ignoran; lista vacía → 0", async () => {
    expect(await companyWorkerOutput(client({}), [], LABOR_CONSTANTS)).toBe(0);
    expect(await companyWorkerOutput(client({}), [{ wage: 1, fidelity: 0 }], LABOR_CONSTANTS)).toBe(0);
  });
});
