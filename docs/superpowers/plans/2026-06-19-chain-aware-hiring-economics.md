# Chain-Aware Hiring Economics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make hiring recommendations economically faithful by valuing each item at its best destination (sell vs process), expressing the verdict in $/worker/day against the live labor market, and adding a chain-level verdict (raw→product) that nets all wages and bought inputs.

**Architecture:** Two new pure modules (`item-value.ts`, `chain.ts`) compute best-destination value and chain economics. `hiring-recommender.ts` gains a $/worker/day net + a `market_expensive` reason. Server services (`company-report`, `company-detail`, `portfolio`) thread item value and chains through to the existing `Portfolio`/`CompanyDetail` DTOs, which flow unchanged to the UI. UI: rewritten `HiringPanel` and a new dashboard `ChainsCard`.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Tailwind v4, Vitest + @testing-library/react (jsdom), lucide-react.

**Spec:** `docs/superpowers/specs/2026-06-19-chain-aware-hiring-economics-design.md`

**Branch:** `feat/chain-aware-hiring` (already created; contains the Mejoras-card fix + the spec).

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/economy/item-value.ts` (new) | `bestDestinationValue`, `maxWagePerPointFromValue` — pure |
| `src/lib/economy/chain.ts` (new) | `detectChains`, `chainNetPerDay`, types `ChainCompany`/`Chain`/`ChainNet` — pure |
| `src/lib/economy/hiring-recommender.ts` (modify) | add `netPerWorkerPerDay`/`addsPerDay`/`marketWagePerDay` + `market_expensive` reason |
| `src/lib/economy/index.ts` (modify) | re-export new modules |
| `src/server/company-report.ts` (modify) | accept optional `itemValue`; value-based margin/maxWage; expose `destination?` |
| `src/server/company-detail.ts` (modify) | compute item value (downstream-aware), value-based hiring, attach `chain` |
| `src/server/portfolio.ts` (modify) | detect chains, compute `chainNetPerDay`, expose `chains` |
| `src/components/detail/hiring-panel.tsx` (modify) | rewrite to $/worker/day + chain line |
| `src/components/dashboard/chains-card.tsx` (new) | dashboard chains card |
| `src/app/dashboard/page.tsx` (modify) | render `ChainsCard` |

Test files sit next to each source file (`*.test.ts` / `*.test.tsx`), matching the existing convention.

---

## Task 1: Item value (best destination)

**Files:**
- Create: `src/lib/economy/item-value.ts`
- Test: `src/lib/economy/item-value.test.ts`
- Modify: `src/lib/economy/index.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/economy/item-value.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { bestDestinationValue, maxWagePerPointFromValue } from "./item-value";
import type { ItemDef } from "./types";

const taxes = { income: 4, market: 1, selfWork: 4 };
const raw = (code: string): ItemDef => ({ code, type: "raw", productionPoints: 1, productionNeeds: {} });
const product = (code: string, needs: Record<string, number>, pp = 1): ItemDef => ({
  code, type: "product", productionPoints: pp, productionNeeds: needs,
});

describe("bestDestinationValue", () => {
  it("sin downstream propio → vale su venta neta", () => {
    const v = bestDestinationValue({ item: raw("iron"), prices: { iron: 0.08 }, taxes });
    expect(v.destination).toBe("sell");
    expect(v.processValue).toBeNull();
    expect(v.unitValue).toBeCloseTo(0.08 * 0.99, 6);
  });

  it("petróleo a precios actuales → mejor destino vender (procesar rinde menos)", () => {
    const v = bestDestinationValue({
      item: raw("petroleum"),
      prices: { petroleum: 0.0951, oil: 0.1775 },
      taxes,
      downstream: { item: product("oil", { petroleum: 1 }, 1) },
      marketWagePerPoint: 0.13,
    });
    // sellNet=0.0941; processValue=(0.1757-0-0.13)/1=0.0457 → vender
    expect(v.destination).toBe("sell");
    expect(v.processValue).toBeCloseTo((0.1775 * 0.99 - 0.13) / 1, 4);
    expect(v.unitValue).toBeCloseTo(0.0951 * 0.99, 4);
  });

  it("cuando procesar rinde más → destino process", () => {
    const v = bestDestinationValue({
      item: raw("petroleum"),
      prices: { petroleum: 0.05, oil: 0.5 },
      taxes,
      downstream: { item: product("oil", { petroleum: 1 }, 1) },
      marketWagePerPoint: 0.02,
    });
    // sellNet=0.0495; processValue=(0.495-0-0.02)/1=0.475 → procesar
    expect(v.destination).toBe("process");
    expect(v.unitValue).toBeCloseTo((0.5 * 0.99 - 0.02) / 1, 4);
  });

  it("descuenta otros insumos comprados del downstream", () => {
    const v = bestDestinationValue({
      item: raw("petroleum"),
      prices: { petroleum: 0.05, oil: 0.5, additive: 0.1 },
      taxes,
      downstream: { item: product("oil", { petroleum: 1, additive: 1 }, 1) },
      marketWagePerPoint: 0,
    });
    // processValue=(0.495 - 0.1 - 0)/1 = 0.395
    expect(v.processValue).toBeCloseTo(0.5 * 0.99 - 0.1, 4);
  });
});

describe("maxWagePerPointFromValue", () => {
  it("= (unitValue - insumo) / prodPoints", () => {
    expect(maxWagePerPointFromValue(1.573, 0.805, 10)).toBeCloseTo((1.573 - 0.805) / 10, 6);
  });
  it("prodPoints 0 → 0", () => {
    expect(maxWagePerPointFromValue(1, 0, 0)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/economy/item-value.test.ts`
Expected: FAIL (`bestDestinationValue` not exported / module not found).

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/economy/item-value.ts`:

```ts
import type { ItemDef, PriceMap, Taxes } from "./types";

export type Destination = "sell" | "process";

export interface ItemValue {
  /** Valor marginal real de una unidad = mejor destino. */
  unitValue: number;
  destination: Destination;
  /** Venta neta = precio × (1 − impMercado). */
  sellNet: number;
  /** Valor procesándolo en el producto downstream propio; null si no aplica. */
  processValue: number | null;
}

/**
 * Valor marginal real de una unidad del ítem: max(venderlo neto, procesarlo).
 * `downstream` es el producto propio que consume este ítem (si existe). `marketWagePerPoint`
 * costea la mano de obra de procesar el downstream (default 0).
 */
export function bestDestinationValue(args: {
  item: ItemDef;
  prices: PriceMap;
  taxes: Taxes;
  downstream?: { item: ItemDef } | null;
  marketWagePerPoint?: number;
}): ItemValue {
  const market = (args.taxes.market ?? 0) / 100;
  const price = args.prices[args.item.code] ?? 0;
  const sellNet = price * (1 - market);

  let processValue: number | null = null;
  if (args.downstream) {
    const q = args.downstream.item;
    const n = q.productionNeeds[args.item.code] ?? 0;
    if (n > 0) {
      const qSellNet = (args.prices[q.code] ?? 0) * (1 - market);
      let otherInputs = 0;
      for (const [code, qty] of Object.entries(q.productionNeeds)) {
        if (code === args.item.code) continue;
        otherInputs += qty * (args.prices[code] ?? 0);
      }
      const processLabor = (args.marketWagePerPoint ?? 0) * q.productionPoints;
      processValue = (qSellNet - otherInputs - processLabor) / n;
    }
  }

  const useProcess = processValue != null && processValue > sellNet;
  return {
    unitValue: useProcess ? (processValue as number) : sellNet,
    destination: useProcess ? "process" : "sell",
    sellNet,
    processValue,
  };
}

/** Salario máximo pagable por punto de producción dado el valor del ítem. */
export function maxWagePerPointFromValue(
  unitValue: number,
  inputCostPerUnit: number,
  prodPoints: number,
): number {
  return prodPoints > 0 ? (unitValue - inputCostPerUnit) / prodPoints : 0;
}
```

Add to `src/lib/economy/index.ts` (after the `./hiring-recommender` line):

```ts
export * from "./item-value";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/economy/item-value.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/economy/item-value.ts src/lib/economy/item-value.test.ts src/lib/economy/index.ts
git commit -m "feat(economy): best-destination item value (sell vs process)"
```

---

## Task 2: Chain detection and net/day

**Files:**
- Create: `src/lib/economy/chain.ts`
- Test: `src/lib/economy/chain.test.ts`
- Modify: `src/lib/economy/index.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/economy/chain.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { detectChains, chainNetPerDay, type ChainCompany } from "./chain";
import type { ItemDef } from "./types";

const raw = (code: string): ItemDef => ({ code, type: "raw", productionPoints: 1, productionNeeds: {} });
const product = (code: string, needs: Record<string, number>, pp = 1): ItemDef => ({
  code, type: "product", productionPoints: pp, productionNeeds: needs,
});

const cc = (over: Partial<ChainCompany> & { itemCode: string; item: ItemDef }): ChainCompany => ({
  id: over.itemCode, dailyProductionRate: 0, wageCostPerDay: 0, ...over,
});

describe("detectChains", () => {
  it("arma cadenas donde el usuario tiene raw y producto", () => {
    const companies = [
      cc({ itemCode: "petroleum", item: raw("petroleum") }),
      cc({ itemCode: "oil", item: product("oil", { petroleum: 1 }) }),
      cc({ itemCode: "iron", item: raw("iron") }),
      cc({ itemCode: "steel", item: product("steel", { iron: 10 }, 10) }),
    ];
    const chains = detectChains(companies);
    expect(chains.map((c) => c.steps)).toEqual([
      ["petroleum", "oil"],
      ["iron", "steel"],
    ]);
  });

  it("no arma cadena si falta un extremo", () => {
    const companies = [cc({ itemCode: "oil", item: product("oil", { petroleum: 1 }) })];
    expect(detectChains(companies)).toEqual([]);
  });
});

describe("chainNetPerDay", () => {
  const taxes = { income: 4, market: 1, selfWork: 4 };
  const chain = {
    steps: ["petroleum", "oil"],
    companies: [
      cc({ itemCode: "petroleum", item: raw("petroleum"), dailyProductionRate: 100, wageCostPerDay: 5 }),
      cc({ itemCode: "oil", item: product("oil", { petroleum: 1 }), dailyProductionRate: 100, wageCostPerDay: 4 }),
    ],
  };

  it("ingreso del final neto − todos los sueldos − insumos comprados", () => {
    const net = chainNetPerDay({ chain, prices: { oil: 0.1775 }, taxes, measured: true, rawDestination: "sell" });
    // ingreso = 100 × 0.1775 × 0.99 = 17.5725 ; sueldos = 9 ; insumos comprados = 0 (petroleum autoabastecido)
    expect(net.netPerDay).toBeCloseTo(100 * 0.1775 * 0.99 - 9, 4);
    expect(net.measured).toBe(true);
    expect(net.bestRawDestination).toBe("sell");
    expect(net.steps).toEqual(["petroleum", "oil"]);
  });

  it("descuenta insumos del final que NO se autoabastecen", () => {
    const chain2 = {
      steps: ["petroleum", "oil"],
      companies: [
        cc({ itemCode: "petroleum", item: raw("petroleum"), dailyProductionRate: 100, wageCostPerDay: 0 }),
        cc({ itemCode: "oil", item: product("oil", { petroleum: 1, additive: 2 }), dailyProductionRate: 100, wageCostPerDay: 0 }),
      ],
    };
    const net = chainNetPerDay({ chain: chain2, prices: { oil: 0.5, additive: 0.1 }, taxes, measured: false, rawDestination: "process" });
    // ingreso = 100×0.5×0.99 = 49.5 ; insumos comprados = additive 2×100×0.1 = 20
    expect(net.netPerDay).toBeCloseTo(49.5 - 20, 4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/economy/chain.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/economy/chain.ts`:

```ts
import type { ItemDef, PriceMap, Taxes } from "./types";

export interface ChainCompany {
  id: string;
  itemCode: string;
  item: ItemDef;
  /** Tasa de producción diaria (real medida o modelo). */
  dailyProductionRate: number;
  /** Suma de sueldos reales/día de esta empresa (0 si no se conoce). */
  wageCostPerDay: number;
}

export interface Chain {
  /** Del raw al producto final, ej. ["petroleum","oil"]. */
  steps: string[];
  /** Empresas en el orden de `steps`. */
  companies: ChainCompany[];
}

export interface ChainNet {
  steps: string[];
  netPerDay: number;
  bestRawDestination: "sell" | "process";
  /** true si la producción del final proviene de ventas reales medidas. */
  measured: boolean;
}

/**
 * Detecta cadenas de 2 niveles donde el usuario es dueño del insumo y del producto
 * que lo consume. Una entrada por par (raw, producto).
 */
export function detectChains(companies: ChainCompany[]): Chain[] {
  const byItem = new Map<string, ChainCompany>();
  for (const c of companies) byItem.set(c.itemCode, c);
  const chains: Chain[] = [];
  for (const prod of companies) {
    for (const inputCode of Object.keys(prod.item.productionNeeds)) {
      const rawCompany = byItem.get(inputCode);
      if (rawCompany) {
        chains.push({ steps: [inputCode, prod.itemCode], companies: [rawCompany, prod] });
      }
    }
  }
  return chains;
}

/**
 * Neto/día de la cadena: ingreso neto del producto final − sueldos de TODAS las empresas
 * − insumos del final comprados afuera (todos menos el raw que se autoabastece).
 * Simplificación v1: se asume que el raw propio cubre la necesidad del final.
 */
export function chainNetPerDay(args: {
  chain: Chain;
  prices: PriceMap;
  taxes: Taxes;
  measured: boolean;
  rawDestination: "sell" | "process";
}): ChainNet {
  const market = (args.taxes.market ?? 0) / 100;
  const raw = args.chain.companies[0];
  const final = args.chain.companies[args.chain.companies.length - 1];

  const ingreso = final.dailyProductionRate * (args.prices[final.itemCode] ?? 0) * (1 - market);
  const wages = args.chain.companies.reduce((s, c) => s + c.wageCostPerDay, 0);

  let boughtInputs = 0;
  for (const [code, qty] of Object.entries(final.item.productionNeeds)) {
    if (code === raw.itemCode) continue;
    boughtInputs += qty * final.dailyProductionRate * (args.prices[code] ?? 0);
  }

  return {
    steps: args.chain.steps,
    netPerDay: ingreso - wages - boughtInputs,
    bestRawDestination: args.rawDestination,
    measured: args.measured,
  };
}
```

Add to `src/lib/economy/index.ts`:

```ts
export * from "./chain";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/economy/chain.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/economy/chain.ts src/lib/economy/chain.test.ts src/lib/economy/index.ts
git commit -m "feat(economy): detect 2-level chains + chain net/day"
```

---

## Task 3: Hiring verdict in $/worker/day

**Files:**
- Modify: `src/lib/economy/hiring-recommender.ts`
- Test: `src/lib/economy/hiring-recommender.test.ts` (existing — read it first; update calls and add cases)

- [ ] **Step 1: Write the failing test**

First read the existing test file to keep its existing cases working with the new signature. Then add/adjust. Append these cases to `src/lib/economy/hiring-recommender.test.ts` and update existing `hiringRecommendation(...)` calls in that file to include the new required args `prodPoints`, `unitValue`, `inputCostPerUnit` (use `unitValue: marginPerUnit`, `inputCostPerUnit: 0`, `prodPoints: 1` where the old cases didn't care):

```ts
import { describe, it, expect } from "vitest";
import { hiringRecommendation } from "./hiring-recommender";
import { LABOR_CONSTANTS } from "./labor";

const market = (wage: number | null) => ({
  count: wage == null ? 0 : 3,
  medianWage: wage,
  medianMinProduction: 50,
  medianMinEnergy: 50,
});

describe("hiringRecommendation $/worker/day", () => {
  it("mercado caro (wage de mercado deja neto ≤ 0) → market_expensive", () => {
    const rec = hiringRecommendation({
      marginPerUnit: 0.0942,
      unitValue: 0.0942,
      inputCostPerUnit: 0,
      prodPoints: 1,
      maxWagePerPoint: 0.0942,
      currentDailyRate: 100,
      freeSlots: 2,
      sellPerDay: 1000,
      market: market(0.13),
      laborConstants: LABOR_CONSTANTS,
    });
    expect(rec.viable).toBe(false);
    expect(rec.reason).toBe("market_expensive");
    expect(rec.netPerWorkerPerDay).toBeLessThanOrEqual(0);
  });

  it("salario de mercado bajo → conviene, neto/día positivo", () => {
    const rec = hiringRecommendation({
      marginPerUnit: 0.0942,
      unitValue: 0.0942,
      inputCostPerUnit: 0,
      prodPoints: 1,
      maxWagePerPoint: 0.0942,
      currentDailyRate: 100,
      freeSlots: 2,
      sellPerDay: 100000,
      market: market(0.02),
      laborConstants: LABOR_CONSTANTS,
    });
    expect(rec.viable).toBe(true);
    expect(rec.reason).toBe("ok");
    expect(rec.netPerWorkerPerDay).toBeGreaterThan(0);
    expect(rec.marketWagePerDay).toBeGreaterThan(0);
    expect(rec.addsPerDay).toBeGreaterThan(0);
  });

  it("ítem sin margen → item_unprofitable (antes que market_expensive)", () => {
    const rec = hiringRecommendation({
      marginPerUnit: -0.1, unitValue: 0, inputCostPerUnit: 0.1, prodPoints: 1,
      maxWagePerPoint: -0.1, currentDailyRate: 0, freeSlots: 2,
      market: market(0.01), laborConstants: LABOR_CONSTANTS,
    });
    expect(rec.viable).toBe(false);
    expect(rec.reason).toBe("item_unprofitable");
  });

  it("sin cupos → no_slots", () => {
    const rec = hiringRecommendation({
      marginPerUnit: 0.5, unitValue: 0.5, inputCostPerUnit: 0, prodPoints: 1,
      maxWagePerPoint: 0.5, currentDailyRate: 0, freeSlots: 0,
      market: market(0.01), laborConstants: LABOR_CONSTANTS,
    });
    expect(rec.reason).toBe("no_slots");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/economy/hiring-recommender.test.ts`
Expected: FAIL (`netPerWorkerPerDay` undefined / `market_expensive` not produced / type error on new args).

- [ ] **Step 3: Write minimal implementation**

Replace `src/lib/economy/hiring-recommender.ts` with:

```ts
import { workerUnitsPerDay, levelForProductionValue, type LaborConstants } from "./labor";
import type { LaborMarketSummary } from "./labor-market";

export type HiringReason = "item_unprofitable" | "no_slots" | "no_demand" | "market_expensive" | "ok";

export interface RecommendedProfile {
  minProduction: number;
  minEnergy: number;
  minLevel: number;
}

export interface HiringRecommendation {
  viable: boolean;
  reason: HiringReason;
  maxWagePerPoint: number;
  suggestedWage: number;
  freeSlots: number;
  /** true si conocemos la venta/día real (token); false = supuesto. */
  demandKnown: boolean;
  recommendedProfile: RecommendedProfile;
  /** Ganancia neta extra esperada por día si contratás el perfil sugerido. */
  expectedDailyGain: number;
  /** Valor que aporta un trabajador del perfil sugerido por día. */
  addsPerDay: number;
  /** Costo/día de ese trabajador al salario de mercado. */
  marketWagePerDay: number;
  /** Neto/día del trabajador = aporta − costo de mercado (número principal de la UI). */
  netPerWorkerPerDay: number;
}

const EMPTY_PROFILE: RecommendedProfile = { minProduction: 0, minEnergy: 0, minLevel: 0 };

export function hiringRecommendation(args: {
  marginPerUnit: number;
  /** Valor marginal real de una unidad (mejor destino). */
  unitValue: number;
  /** Costo de insumos comprados por unidad. */
  inputCostPerUnit: number;
  /** Puntos de producción por unidad del ítem. */
  prodPoints: number;
  maxWagePerPoint: number;
  /** Tasa de producción diaria actual (automatización + trabajadores). */
  currentDailyRate: number;
  freeSlots: number;
  sellPerDay?: number;
  market: LaborMarketSummary;
  laborConstants: LaborConstants;
}): HiringRecommendation {
  const demandKnown = args.sellPerDay !== undefined;

  // Perfil sugerido a partir del mercado.
  const minEnergy = args.market.medianMinEnergy ?? 50;
  const minProduction = args.market.medianMinProduction ?? 50;
  const minLevel = levelForProductionValue(minProduction);
  const profile: RecommendedProfile = { minProduction, minEnergy, minLevel };

  // Economía de un trabajador del perfil.
  const perWorkerUnits = workerUnitsPerDay(minProduction, minEnergy, 0, args.laborConstants);
  const addsPerDay = perWorkerUnits * (args.unitValue - args.inputCostPerUnit);
  const marketWagePerPoint = args.market.medianWage ?? 0;
  const marketWagePerDay = marketWagePerPoint * args.prodPoints * perWorkerUnits;
  const netPerWorkerPerDay = addsPerDay - marketWagePerDay;

  const marketWage = args.market.medianWage ?? args.maxWagePerPoint * 0.85;
  const suggestedWage = Math.max(0, Math.min(args.maxWagePerPoint * 0.95, marketWage));

  const baseOut = {
    maxWagePerPoint: args.maxWagePerPoint,
    suggestedWage: 0,
    freeSlots: args.freeSlots,
    demandKnown,
    recommendedProfile: EMPTY_PROFILE,
    expectedDailyGain: 0,
    addsPerDay,
    marketWagePerDay,
    netPerWorkerPerDay,
  };

  if (args.marginPerUnit <= 0) return { ...baseOut, viable: false, reason: "item_unprofitable" };
  if (args.freeSlots <= 0) return { ...baseOut, viable: false, reason: "no_slots" };

  const headroom = demandKnown ? (args.sellPerDay as number) - args.currentDailyRate : Infinity;
  if (demandKnown && headroom <= 0) return { ...baseOut, viable: false, reason: "no_demand" };

  if (netPerWorkerPerDay <= 0) {
    return { ...baseOut, viable: false, reason: "market_expensive", recommendedProfile: profile };
  }

  // Ganancia esperada/día: unidades que aporta el perfil (limitadas por headroom y slots)
  // por el margen restante tras pagar el salario sugerido.
  const totalWorkerUnits = perWorkerUnits * args.freeSlots;
  const addressable = Number.isFinite(headroom) ? Math.min(totalWorkerUnits, headroom) : totalWorkerUnits;
  const expectedDailyGain = addressable * Math.max(0, args.maxWagePerPoint - suggestedWage);

  return {
    ...baseOut,
    viable: true,
    reason: "ok",
    suggestedWage,
    recommendedProfile: profile,
    expectedDailyGain,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/economy/hiring-recommender.test.ts`
Expected: PASS (existing cases + 4 new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/economy/hiring-recommender.ts src/lib/economy/hiring-recommender.test.ts
git commit -m "feat(economy): hiring verdict in net $/worker/day + market_expensive"
```

---

## Task 4: Report uses best-destination value

**Files:**
- Modify: `src/server/company-report.ts`
- Test: `src/server/company-report.test.ts` (existing — add a case; existing cases must stay green)

- [ ] **Step 1: Write the failing test**

Append to `src/server/company-report.test.ts`:

```ts
import { bestDestinationValue } from "@/lib/economy";

describe("assembleCompanyReport con itemValue", () => {
  it("usa el valor de mejor destino para margen/maxWage y expone destination", () => {
    const item = { code: "petroleum", type: "raw" as const, productionPoints: 1, productionNeeds: {} };
    const taxes = { income: 4, market: 1, selfWork: 4 };
    const prices = { petroleum: 0.0951, oil: 0.1775 };
    const itemValue = bestDestinationValue({
      item, prices, taxes,
      downstream: { item: { code: "oil", type: "product" as const, productionPoints: 1, productionNeeds: { petroleum: 1 } } },
      marketWagePerPoint: 0.13,
    });
    const report = assembleCompanyReport({
      company: { id: "c1", itemCode: "petroleum", production: 0, workerCount: 0, upgrades: { automatedEngine: 1, breakRoom: 1, storage: 1 }, name: "OPC", isFull: false, estimatedValue: 0 },
      item, workers: [], prices, taxes,
      upgradesConfig: { automatedEngine: { levels: { "1": { stats: { dailyProd: 24 } } } }, storage: { levels: { "1": { stats: { maxProduction: 200 } } } }, breakRoom: { levels: { "1": { stats: { maxWorkers: 2 } } } } },
      itemValue,
    });
    expect(report.destination).toBe("sell");
    expect(report.marginPerUnit).toBeCloseTo(0.0951 * 0.99, 4); // venta neta − 0 insumos
    expect(report.maxWageToHire).toBeCloseTo(0.0951 * 0.99, 4); // /prodPoints=1
  });
});
```

> Note: confirm the existing test file already imports `assembleCompanyReport` and `describe/it/expect`; if your appended block is in the same file, reuse those imports rather than redeclaring.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/server/company-report.test.ts`
Expected: FAIL (`report.destination` undefined; `itemValue` arg unknown).

- [ ] **Step 3: Write minimal implementation**

In `src/server/company-report.ts`:

1. Update imports (add `maxWagePerPointFromValue`, `type ItemValue`):

```ts
import { companyProfit, maxWagePerPoint, maxWagePerPointFromValue, automationDailyProd, storageMax } from "@/lib/economy";
import type { ItemDef, WorkerData, Taxes, PriceMap, ProfitBreakdown, ItemValue } from "@/lib/economy";
```

2. Add to the `CompanyReport` interface (after `marginPerUnit`):

```ts
  /** Mejor destino del ítem si se calculó (vender vs procesar). */
  destination?: "sell" | "process";
```

3. Add `itemValue?: ItemValue;` to the `assembleCompanyReport` args object (next to `priceInfo`).

4. Replace the `const mw = maxWagePerPoint(...)` block and the returned `maxWageToHire`/`marginPerUnit` so that when `itemValue` is provided it drives the numbers:

```ts
  let marginPerUnit: number;
  let maxWageToHire: number;
  let destination: "sell" | "process" | undefined;
  if (args.itemValue) {
    let inputCostPerUnit = 0;
    for (const [code, qty] of Object.entries(args.item.productionNeeds)) {
      inputCostPerUnit += qty * (args.prices[code] ?? 0);
    }
    marginPerUnit = args.itemValue.unitValue - inputCostPerUnit;
    maxWageToHire = maxWagePerPointFromValue(args.itemValue.unitValue, inputCostPerUnit, args.item.productionPoints);
    destination = args.itemValue.destination;
  } else {
    const mw = maxWagePerPoint(args.item, args.prices, args.taxes);
    marginPerUnit = mw.marginPerUnit;
    maxWageToHire = mw.maxWage;
  }
```

5. In the returned object, set `maxWageToHire`, `marginPerUnit`, and add `destination`:

```ts
    maxWageToHire,
    marginPerUnit,
    destination,
```

(remove the old `maxWageToHire: mw.maxWage,` and `marginPerUnit: mw.marginPerUnit,` lines.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/server/company-report.test.ts`
Expected: PASS (existing cases — which pass no `itemValue` and keep old behavior — plus the new one).

- [ ] **Step 5: Commit**

```bash
git add src/server/company-report.ts src/server/company-report.test.ts
git commit -m "feat(server): report margin/maxWage from best-destination value"
```

---

## Task 5: Company detail — value-aware hiring + chain line

**Files:**
- Modify: `src/server/company-detail.ts`
- Test: `src/server/company-detail.test.ts` (existing — add a chain/value case)

- [ ] **Step 1: Write the failing test**

Read `src/server/company-detail.test.ts` for its fake-client shape. Add a case asserting that when the user owns the downstream company, `detail.report.destination` is set and `detail.chain` is populated. Use the file's existing fake-client factory; the block below shows the assertions and the key fake responses to add (petroleum company whose user also owns oil):

```ts
it("expone destination y la cadena cuando se posee el downstream", async () => {
  // Fake client: getUserCompanies → [petroleumId, oilId]; getCompanyById returns the
  // matching company; gameConfig.items has petroleum (raw) and oil (needs petroleum).
  const detail = await buildCompanyDetail(fakeClient, {
    companyId: "petroleumId", userId: "u1", authenticated: false,
  });
  expect(detail.report.destination).toBeDefined();
  expect(detail.chain).not.toBeNull();
  expect(detail.chain?.steps).toEqual(["petroleum", "oil"]);
});
```

> Build the fake client by extending the existing one in the file: `getUserCompanies` resolves `{ items: ["petroleumId", "oilId"] }`, and `getCompanyById(id)` resolves a company with `itemCode` `petroleum`/`oil` accordingly, `activeUpgradeLevels: { automatedEngine: 1, breakRoom: 1, storage: 1 }`. `gameConfig.items` must include `oil: { type: "product", productionPoints: 1, productionNeeds: { petroleum: 1 } }` and `petroleum: { type: "raw", productionPoints: 1, productionNeeds: {} }`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/server/company-detail.test.ts`
Expected: FAIL (`detail.chain` undefined; `destination` undefined).

- [ ] **Step 3: Write minimal implementation**

In `src/server/company-detail.ts`:

1. Update imports:

```ts
import {
  toItemDef,
  maxWorkers,
  LABOR_CONSTANTS,
  summarizeLaborMarket,
  hiringRecommendation,
  bestDestinationValue,
  detectChains,
  chainNetPerDay,
  type HiringRecommendation,
  type ChainNet,
  type ChainCompany,
  type ItemDef,
} from "@/lib/economy";
```

2. Add `chain` to the `CompanyDetail` interface:

```ts
  /** Veredicto de la cadena a la que pertenece esta empresa (null si no pertenece). */
  chain: ChainNet | null;
```

3. After the existing single-company fetch, load the user's owned companies to find the downstream product and build the chain set. Insert after `const item = toItemDef(...)` (and before computing the report):

```ts
  // Empresas propias (para destino del raw y detección de cadena).
  const ownedIds = (await client.getUserCompanies(opts.userId).then((r) => r.items).catch(() => [])) as string[];
  const ownedRaw = await Promise.all(
    ownedIds.map((oid) =>
      oid === c._id ? Promise.resolve(c) : client.getCompanyById(oid).catch(() => null),
    ),
  );
  const owned = ownedRaw.filter((x): x is NonNullable<typeof x> => x != null);
  const ownedItem = (code: string): ItemDef =>
    toItemDef(code, gameConfig.items[code] ?? { type: "product", productionPoints: 1, productionNeeds: {} });

  // Mercado laboral (también lo usa el destino para costear la mano de obra de procesar).
  const offers = await client.getWorkOffers({ limit: 20 }).then((r) => r.items).catch(() => []);
  const market = summarizeLaborMarket(offers);

  // Downstream propio que consume este ítem (si existe).
  const downstreamCompany = owned.find(
    (o) => ownedItem(o.itemCode).productionNeeds[c.itemCode] != null,
  );
  const itemValue = bestDestinationValue({
    item, prices, taxes,
    downstream: downstreamCompany ? { item: ownedItem(downstreamCompany.itemCode) } : null,
    marketWagePerPoint: market.medianWage ?? 0,
  });
```

4. Pass `itemValue` into `assembleCompanyReport` (add `itemValue,` to the args object). Remove the now-duplicate `getWorkOffers`/`summarizeLaborMarket` lines further down (they were moved up).

5. Update the `hiringRecommendation(...)` call to use value-based args:

```ts
  let inputCostPerUnit = 0;
  for (const [code, qty] of Object.entries(item.productionNeeds)) {
    inputCostPerUnit += qty * (prices[code] ?? 0);
  }
  const slots = maxWorkers(gameConfig.upgradesConfig, c.activeUpgradeLevels.breakRoom);
  const hiring = hiringRecommendation({
    marginPerUnit: reportWithSell.marginPerUnit,
    unitValue: itemValue.unitValue,
    inputCostPerUnit,
    prodPoints: item.productionPoints,
    maxWagePerPoint: reportWithSell.maxWageToHire,
    currentDailyRate: reportWithSell.dailyProductionRate,
    freeSlots: Math.max(0, slots - c.workerCount),
    sellPerDay: measuredRate,
    market,
    laborConstants: LABOR_CONSTANTS,
  });
```

6. Build the chain this company belongs to. After `hiring`:

```ts
  const chainCompanies: ChainCompany[] = owned.map((o) => ({
    id: o._id,
    itemCode: o.itemCode,
    item: ownedItem(o.itemCode),
    dailyProductionRate: o._id === c._id ? reportWithSell.dailyProductionRate : (o.production ?? 0),
    wageCostPerDay: 0,
  }));
  const myChain = detectChains(chainCompanies).find((ch) => ch.steps.includes(c.itemCode)) ?? null;
  const chain: ChainNet | null = myChain
    ? chainNetPerDay({
        chain: myChain, prices, taxes,
        measured: reportWithSell.measured,
        rawDestination: itemValue.destination,
      })
    : null;
```

> v1 simplification (documented in the spec §5): the detail view estimates partner-company production from its stock field and uses `wageCostPerDay: 0` for partners (real per-partner wages are summed in the dashboard portfolio path). This keeps the detail page from fetching every partner's workers.

7. Add `chain` to the returned object.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/server/company-detail.test.ts`
Expected: PASS (existing + new).

- [ ] **Step 5: Commit**

```bash
git add src/server/company-detail.ts src/server/company-detail.test.ts
git commit -m "feat(server): company detail value-aware hiring + chain verdict"
```

---

## Task 6: Portfolio — chains

**Files:**
- Modify: `src/server/portfolio.ts`
- Test: `src/server/portfolio.test.ts` (existing — add a chains case)

- [ ] **Step 1: Write the failing test**

Read `src/server/portfolio.test.ts` for its fake-client shape (it returns a company list + companies). Add a case where the user owns petroleum + oil and assert `portfolio.chains` has the petroleum→oil chain:

```ts
it("detecta cadenas y expone chains", async () => {
  // Fake: getUserCompanies → [petroleum, oil]; gameConfig.items.oil.productionNeeds = { petroleum: 1 }.
  const portfolio = await buildPortfolio(fakeClient, { userId: "u1", authenticated: false });
  expect(portfolio.chains).toHaveLength(1);
  expect(portfolio.chains[0].steps).toEqual(["petroleum", "oil"]);
  expect(typeof portfolio.chains[0].netPerDay).toBe("number");
});
```

> Extend the file's existing fake client: list `{ items: ["petroleum","oil"] }`, `getCompanyById` returns companies with those `itemCode`s, and `gameConfig.items` includes `oil` needing `petroleum`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/server/portfolio.test.ts`
Expected: FAIL (`portfolio.chains` undefined).

- [ ] **Step 3: Write minimal implementation**

In `src/server/portfolio.ts`:

1. Imports:

```ts
import { toItemDef, bestDestinationValue, detectChains, chainNetPerDay, summarizeLaborMarket, type ChainNet, type ChainCompany } from "@/lib/economy";
```

2. Add `chains: ChainNet[];` to the `Portfolio` interface.

3. Capture the item + wage sum per company in `results` (so chains can reuse them without refetching). In the per-company `map`, after building `item` and `workers`, return them too:

```ts
      const wageCostPerDay = workers.reduce((s, w) => s + (w.wage ?? 0), 0);
      // ...existing report build...
      return { report, workersOk, item, wageCostPerDay };
```

4. Fetch the labor market once (for best-destination wage), before/after the `Promise.all`:

```ts
  const offers = await client.getWorkOffers({ limit: 20 }).then((r) => r.items).catch(() => []);
  const marketWagePerPoint = summarizeLaborMarket(offers).medianWage ?? 0;
```

5. After `const companies = results.map((r) => r.report);`, build chains:

```ts
  const chainCompanies: ChainCompany[] = results.map((r) => ({
    id: r.report.id,
    itemCode: r.report.itemCode,
    item: r.item,
    dailyProductionRate: r.report.dailyProductionRate,
    wageCostPerDay: r.wageCostPerDay,
  }));
  const chains: ChainNet[] = detectChains(chainCompanies).map((ch) => {
    const rawCompany = ch.companies[0];
    const downstream = ch.companies[ch.companies.length - 1];
    const dest = bestDestinationValue({
      item: rawCompany.item, prices, taxes,
      downstream: { item: downstream.item }, marketWagePerPoint,
    }).destination;
    return chainNetPerDay({
      chain: ch, prices, taxes,
      measured: downstream.dailyProductionRate > 0 && companies.find((c) => c.id === downstream.id)?.measured === true,
      rawDestination: dest,
    });
  });
```

6. Add `chains` to the returned object.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/server/portfolio.test.ts`
Expected: PASS (existing + new).

- [ ] **Step 5: Commit**

```bash
git add src/server/portfolio.ts src/server/portfolio.test.ts
git commit -m "feat(server): expose detected chains + net/day in portfolio"
```

---

## Task 7: Rewrite HiringPanel ($/worker/day)

**Files:**
- Modify: `src/components/detail/hiring-panel.tsx`
- Modify: `src/app/company/[id]/page.tsx` (pass `chain` to the panel)
- Test: `src/components/detail/hiring-panel.test.tsx` (existing — update assertions)

- [ ] **Step 1: Write the failing test**

Read the existing `hiring-panel.test.tsx`, then replace its body to reflect the new UI. The panel now receives `hiring` + optional `chain`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HiringPanel } from "./hiring-panel";

const base = {
  viable: true, reason: "ok" as const, maxWagePerPoint: 0.09, suggestedWage: 0.05,
  freeSlots: 2, demandKnown: true, recommendedProfile: { minProduction: 50, minEnergy: 50, minLevel: 14 },
  expectedDailyGain: 1, addsPerDay: 3, marketWagePerDay: 1, netPerWorkerPerDay: 2,
};

describe("HiringPanel", () => {
  it("muestra neto/trabajador/día y el veredicto conviene", () => {
    render(<HiringPanel hiring={base} chain={null} />);
    expect(screen.getByText(/Conviene contratar/i)).toBeInTheDocument();
    expect(screen.getByText(/trabajador\/día/i)).toBeInTheDocument();
  });

  it("muestra motivo mercado caro cuando no conviene por salario", () => {
    render(<HiringPanel hiring={{ ...base, viable: false, reason: "market_expensive", netPerWorkerPerDay: -1 }} chain={null} />);
    expect(screen.getByText(/No conviene/i)).toBeInTheDocument();
    expect(screen.getByText(/mercado/i)).toBeInTheDocument();
  });

  it("muestra la línea de cadena cuando pertenece a una", () => {
    render(
      <HiringPanel
        hiring={base}
        chain={{ steps: ["petroleum", "oil"], netPerDay: -2.5, bestRawDestination: "sell", measured: false }}
      />,
    );
    expect(screen.getByText(/petroleum/)).toBeInTheDocument();
    expect(screen.getByText(/oil/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/detail/hiring-panel.test.tsx`
Expected: FAIL (props/text mismatch).

- [ ] **Step 3: Write minimal implementation**

Replace `src/components/detail/hiring-panel.tsx`:

```tsx
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserPlus, CheckCircle2, XCircle, Link2 } from "lucide-react";
import { formatMoney, formatPerDay } from "@/lib/format";
import type { HiringRecommendation, ChainNet } from "@/lib/economy";

const REASON: Record<string, string> = {
  item_unprofitable: "El producto no deja margen: no conviene producir.",
  no_slots: "No hay cupos libres (subí los cupos de trabajadores).",
  no_demand: "Ya producís más de lo que vendés: contratar solo llenaría el almacén.",
  market_expensive: "El mercado laboral está caro: el sueldo supera lo que aporta el trabajador.",
  ok: "Conviene contratar.",
};

export function HiringPanel({ hiring, chain }: { hiring: HiringRecommendation; chain: ChainNet | null }) {
  const net = hiring.netPerWorkerPerDay;
  return (
    <Card className="cursor-default">
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        <UserPlus className="h-4 w-4" aria-hidden="true" /> Contratación
      </h2>
      <div className="flex items-center gap-2">
        {hiring.viable ? (
          <CheckCircle2 className="h-5 w-5 text-success" aria-hidden="true" />
        ) : (
          <XCircle className="h-5 w-5 text-destructive" aria-hidden="true" />
        )}
        <span className={hiring.viable ? "font-medium text-success" : "font-medium text-destructive"}>
          {hiring.viable ? "Conviene contratar" : "No conviene"}
        </span>
        {!hiring.demandKnown ? <Badge tone="warning">venta supuesta</Badge> : null}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{REASON[hiring.reason]}</p>

      <div className={`mt-3 tabular text-2xl font-bold ${net >= 0 ? "text-success" : "text-destructive"}`}>
        {formatPerDay(net)} <span className="text-xs font-normal text-muted-foreground">/ trabajador/día</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        el mercado pide ~{formatMoney(hiring.marketWagePerDay)}/día · te aporta ~{formatMoney(hiring.addsPerDay)}/día
      </p>
      <p className="text-xs text-muted-foreground">
        salario máx pagable ~{formatMoney(hiring.maxWagePerPoint)}/punto
      </p>

      {hiring.viable ? (
        <div className="mt-3 rounded-lg border border-border bg-surface-2 p-3 text-sm">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Perfil sugerido</div>
          <div className="flex flex-wrap gap-2">
            <Badge>min producción: {hiring.recommendedProfile.minProduction}</Badge>
            <Badge>min energía: {hiring.recommendedProfile.minEnergy}</Badge>
            <Badge>min nivel: {hiring.recommendedProfile.minLevel}</Badge>
          </div>
        </div>
      ) : null}

      {chain ? (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
          Parte de la cadena <span className="font-mono">{chain.steps.join("→")}</span> · neto cadena{" "}
          <span className={chain.netPerDay >= 0 ? "text-success" : "text-destructive"}>{formatPerDay(chain.netPerDay)}</span>
          {" "}· mejor destino del raw: {chain.bestRawDestination === "sell" ? "vender" : "procesar"}
        </p>
      ) : null}
    </Card>
  );
}
```

In `src/app/company/[id]/page.tsx`, update the panel usage:

```tsx
              <HiringPanel hiring={data.hiring} chain={data.chain} />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/components/detail/hiring-panel.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/detail/hiring-panel.tsx src/app/company/\[id\]/page.tsx src/components/detail/hiring-panel.test.tsx
git commit -m "feat(ui): hiring panel in net $/worker/day + chain line"
```

---

## Task 8: Dashboard ChainsCard

**Files:**
- Create: `src/components/dashboard/chains-card.tsx`
- Create: `src/components/dashboard/chains-card.test.tsx`
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/dashboard/chains-card.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChainsCard } from "./chains-card";

describe("ChainsCard", () => {
  it("no renderiza nada sin cadenas", () => {
    const { container } = render(<ChainsCard chains={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("muestra una fila por cadena con neto y mejor destino", () => {
    render(
      <ChainsCard
        chains={[{ steps: ["petroleum", "oil"], netPerDay: -2.5, bestRawDestination: "sell", measured: false }]}
      />,
    );
    expect(screen.getByText(/petroleum→oil/)).toBeInTheDocument();
    expect(screen.getByText(/vender/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/dashboard/chains-card.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

Create `src/components/dashboard/chains-card.tsx`:

```tsx
import { Card } from "@/components/ui/card";
import { Link2 } from "lucide-react";
import { formatPerDay } from "@/lib/format";
import type { ChainNet } from "@/lib/economy";

export function ChainsCard({ chains }: { chains: ChainNet[] }) {
  if (chains.length === 0) return null;
  return (
    <Card className="cursor-default">
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        <Link2 className="h-4 w-4" aria-hidden="true" /> Cadenas
      </h2>
      <ul className="flex flex-col gap-2 text-sm">
        {chains.map((c) => (
          <li key={c.steps.join("-")} className="flex items-center justify-between gap-3">
            <span className="font-mono">{c.steps.join("→")}</span>
            <span className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                mejor destino: {c.bestRawDestination === "sell" ? "vender" : "procesar"}
              </span>
              <span className={`tabular font-medium ${c.netPerDay >= 0 ? "text-success" : "text-destructive"}`}>
                {formatPerDay(c.netPerDay)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
```

In `src/app/dashboard/page.tsx`:

1. Import: `import { ChainsCard } from "@/components/dashboard/chains-card";`
2. Render it between `<PortfolioAlerts ... />` and the companies grid:

```tsx
          <PortfolioAlerts portfolio={data} />
          <ChainsCard chains={data.chains} />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/components/dashboard/chains-card.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/chains-card.tsx src/components/dashboard/chains-card.test.tsx src/app/dashboard/page.tsx
git commit -m "feat(ui): dashboard chains card"
```

---

## Task 9: Full verification

- [ ] **Step 1: Run the whole suite + types + build**

Run:
```bash
npm test
./node_modules/.bin/tsc --noEmit
npm run build
```
Expected: all tests pass, tsc exits 0, build succeeds.

- [ ] **Step 2: Fix any cross-file fallout**

If `tsc` flags a `CompanyDetail` consumer missing `chain` or a `Portfolio` consumer missing `chains`, update that consumer. Re-run Step 1 until green.

- [ ] **Step 3: Commit any fixups**

```bash
git add -A
git commit -m "chore: typecheck + build fixups for chain-aware hiring"
```

---

## Self-Review notes (for the implementer)

- **Spec §3.1/§3.2 (best destination + maxWage):** Task 1 + Task 4.
- **Spec §3.3 (process valuation backward induction):** Task 1 `bestDestinationValue` process branch.
- **Spec §4 (net $/worker/day + market_expensive):** Task 3 + Task 7.
- **Spec §5 (chain detection + net/day, both dashboard & detail):** Task 2 (pure), Task 6 (dashboard), Task 5 (detail line).
- **Spec §6.3 Mejoras card:** already fixed in commit `b0e6af6` (out of this plan).
- **Type consistency:** `ItemValue`, `Destination`, `ChainCompany`, `Chain`, `ChainNet` are defined in Tasks 1–2 and consumed unchanged in Tasks 4–8. `HiringRecommendation` gains `addsPerDay`/`marketWagePerDay`/`netPerWorkerPerDay` in Task 3 and is consumed in Task 7. `CompanyReport.destination?`, `CompanyDetail.chain`, `Portfolio.chains` are added in Tasks 4/5/6 and consumed in Tasks 7/8.
- **Backward-compat:** `assembleCompanyReport` keeps old behavior when `itemValue` is absent (existing report tests unchanged). `maxWagePerPoint` (old) stays for any other consumers.
