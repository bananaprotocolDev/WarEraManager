export interface WorkOfferLite {
  wage?: number;
  minEnergy?: number;
  minProduction?: number;
  minLevel?: number;
}

export interface LaborMarketSummary {
  count: number;
  medianWage: number | null;
  medianMinProduction: number | null;
  medianMinEnergy: number | null;
}

function median(values: number[]): number | null {
  const nums = values.filter((v) => typeof v === "number").sort((a, b) => a - b);
  if (nums.length === 0) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

/** Resume el mercado laboral vigente (medianas de salario/requisitos). */
export function summarizeLaborMarket(offers: WorkOfferLite[]): LaborMarketSummary {
  return {
    count: offers.length,
    medianWage: median(offers.map((o) => o.wage).filter((v): v is number => typeof v === "number")),
    medianMinProduction: median(offers.map((o) => o.minProduction).filter((v): v is number => typeof v === "number")),
    medianMinEnergy: median(offers.map((o) => o.minEnergy).filter((v): v is number => typeof v === "number")),
  };
}
