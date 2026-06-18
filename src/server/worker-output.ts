import type { WareraClient } from "@/lib/warera/client";
import { workerUnitsPerDay, type LaborConstants } from "@/lib/economy";

export interface WorkerLite {
  user?: string;
  wage: number;
  fidelity: number;
}

/** Suma de unidades/día que aportan los trabajadores de una empresa (skills vía getUserLite). */
export async function companyWorkerOutput(
  client: WareraClient,
  workers: WorkerLite[],
  laborConstants: LaborConstants,
): Promise<number> {
  let total = 0;
  for (const w of workers) {
    if (!w.user) continue;
    const u = await client.getUserLite(w.user);
    total += workerUnitsPerDay(u.skills.production.value, u.skills.energy.value, w.fidelity, laborConstants);
  }
  return total;
}
