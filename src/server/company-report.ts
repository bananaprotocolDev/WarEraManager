import { companyProfit, hiringAnalysis } from "@/lib/economy";
import type { ItemDef, CompanyData, WorkerData, Taxes, PriceMap, ProfitBreakdown, HiringResult } from "@/lib/economy";

export interface CompanyReport {
  id: string;
  itemCode: string;
  profit: ProfitBreakdown;
  hiring: HiringResult;
  /** Atajo: salario máximo a pagar por un trabajador extra. */
  maxWageToHire: number;
}

/** Calcula el reporte económico de UNA empresa (puro, sin I/O). */
export function assembleCompanyReport(args: {
  company: CompanyData;
  item: ItemDef;
  workers: WorkerData[];
  prices: PriceMap;
  taxes: Taxes;
}): CompanyReport {
  const profit = companyProfit({
    company: args.company,
    item: args.item,
    workers: args.workers,
    prices: args.prices,
    taxes: args.taxes,
  });
  const hiring = hiringAnalysis({
    company: args.company,
    item: args.item,
    prices: args.prices,
    taxes: args.taxes,
    candidateWage: 0,
  });
  return { id: args.company.id, itemCode: args.company.itemCode, profit, hiring, maxWageToHire: hiring.maxWage };
}
