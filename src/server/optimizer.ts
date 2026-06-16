import type { WareraClient } from "@/lib/warera/client";
import { productionOptimizer, toItemDef } from "@/lib/economy";
import type { ProductionOption } from "@/lib/economy";

export interface OptimizerResult {
  options: ProductionOption[];
}

/** Calcula el ranking "mejor qué producir" usando precios + recetas globales. */
export async function buildOptimizer(client: WareraClient): Promise<OptimizerResult> {
  const [prices, gameConfig] = await Promise.all([client.getPrices(), client.getGameConfig()]);
  const items = Object.entries(gameConfig.items).map(([code, raw]) => toItemDef(code, raw));
  return { options: productionOptimizer({ items, prices }) };
}
