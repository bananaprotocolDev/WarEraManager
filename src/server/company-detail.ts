import type { WareraClient } from "@/lib/warera/client";
import { toItemDef } from "@/lib/economy";
import { assembleCompanyReport, type CompanyReport } from "./company-report";
import { GAME_CONSTANTS, type GameConstants } from "@/lib/game-constants";

export interface RecipeEntry {
  input: string;
  qtyPerUnit: number;
}

export interface CompanyDetail {
  id: string;
  itemCode: string;
  report: CompanyReport;
  workers: { wage: number }[];
  wagesAvailable: boolean;
  upgrades: { automatedEngine: number; breakRoom: number };
  recipe: RecipeEntry[];
  estimated: boolean;
}

export interface BuildCompanyDetailOptions {
  companyId: string;
  userId: string;
  authenticated: boolean;
  constants?: GameConstants;
}

/** Detalle completo de una empresa: desglose, trabajadores, upgrades y receta. */
export async function buildCompanyDetail(
  client: WareraClient,
  opts: BuildCompanyDetailOptions,
): Promise<CompanyDetail> {
  const [prices, gameConfig, user, c] = await Promise.all([
    client.getPrices(),
    client.getGameConfig(),
    client.getUserLite(opts.userId),
    client.getCompanyById(opts.companyId),
  ]);

  const taxes = user.country
    ? (await client.getCountryById(user.country)).taxes
    : { income: 0, market: 0, selfWork: 0 };

  let workers: { wage: number }[] = [];
  let wagesAvailable = opts.authenticated;
  if (opts.authenticated) {
    try {
      workers = await client.getWorkers(opts.companyId);
    } catch {
      wagesAvailable = false;
    }
  }

  const rawItem = gameConfig.items[c.itemCode] ?? { type: "product", productionPoints: 1, productionNeeds: {} };
  const item = toItemDef(c.itemCode, rawItem);

  const company = {
    id: c._id,
    itemCode: c.itemCode,
    production: c.production,
    workerCount: c.workerCount,
    upgrades: c.activeUpgradeLevels,
  };

  const report = assembleCompanyReport({ company, item, workers, prices, taxes, constants: opts.constants ?? GAME_CONSTANTS });
  const recipe: RecipeEntry[] = Object.entries(item.productionNeeds).map(([input, qtyPerUnit]) => ({
    input,
    qtyPerUnit,
  }));

  return {
    id: c._id,
    itemCode: c.itemCode,
    report,
    workers,
    wagesAvailable,
    upgrades: c.activeUpgradeLevels,
    recipe,
    estimated: report.profit.estimated,
  };
}
