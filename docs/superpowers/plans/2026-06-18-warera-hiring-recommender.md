# WarEra Company Manager — Plan 7B: Recomendador de contratación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la app recomiende, por empresa: ¿conviene contratar?, ¿cuánto pagar por punto de producción?, y ¿qué perfil de trabajador (minProducción / minEnergía / minNivel)? — usando automatización, almacén, margen del producto, tu venta real/día (con token) y el mercado laboral vigente.

**Architecture:** Un modelo laboral puro (`workerUnitsPerDay`) estima cuánto produce un trabajador (producción × energía/acciones × fidelidad), con throughput aislado/calibrable (`LABOR_CONSTANTS`). Un recomendador puro (`hiringRecommendation`) combina margen, espacio de demanda (venta/día − tasa actual), slots libres (breakRoom) y referencia de mercado para dar veredicto, salario máx/sugerido y perfil. Un helper de venta real (`realizedSalesPerDay`, extraído de la calibración) da la tendencia de venta desde transacciones (token). El cliente lee el mercado laboral (`workOffer.getWorkOffersPaginated`). El servicio `buildCompanyDetail` se enriquece con la recomendación y, con token, refina `usefulRate = min(tasa, venta/día)`. La UI suma un panel "Contratación" en el detalle.

**Tech Stack:** Next.js 16, TypeScript, Zod, Vitest.

Spec: `docs/superpowers/specs/2026-06-18-production-model-and-hiring-design.md` (Partes B y C). El **parche de calibración** (reorientar a throughput laboral) queda para el Plan 7C. El aporte de trabajadores existentes a la tasa también es 7C (necesita el shape de `worker.getWorkers`, auth-gated, a verificar con token).

---

## Decisiones de alcance (7B)

- **Recomendación = para nuevas contrataciones** (perfil a buscar). NO depende del shape de `worker.getWorkers` (que es 7C). La tasa actual sigue siendo la automatización (7A); la venta/día refina `usefulRate`.
- **Modelo laboral**: `workerUnitsPerDay` con constantes de energía conocidas (`regenDividedBy=10`, `energyCostPerAction=10`) y un `throughputFactor` calibrable (default 1). El veredicto y `maxWagePerPoint` NO dependen del throughput; solo el dimensionamiento del perfil/ganancia.
- **Venta/día (`sellPerDay`)**: con token, de transacciones (`realizedSalesPerDay`). Sin token: `undefined` → el veredicto avisa "no sé tu venta real" y usa solo margen/slots.
- **Mercado laboral**: `workOffer.getWorkOffersPaginated` da `wage`(por punto), `minEnergy`, `minProduction` vigentes → referencia (mediana) para el salario y perfil sugeridos.

## Estructura de archivos

- `src/lib/economy/labor.ts` (+test) — `workerUnitsPerDay`, `LABOR_CONSTANTS`, `productionValueForLevel`/`levelForProductionValue` (Task 1)
- `src/lib/warera/schemas.ts`, `src/lib/warera/client.ts` (+tests) — `workOffersPageSchema` + `getWorkOffers` (Task 2)
- `src/lib/economy/labor-market.ts` (+test) — `summarizeLaborMarket` (Task 2)
- `src/server/sell-rate.ts` (+test) — `realizedSalesPerDay`; refactor de `calibrate.ts` para reusarlo (Task 3)
- `src/lib/economy/hiring-recommender.ts` (+test) — `hiringRecommendation` (Task 4)
- `src/server/company-detail.ts` (+test) — enriquecer con `hiring` + `sellPerDay` (Task 5)
- `src/app/company/[id]/page.tsx`, `src/components/detail/hiring-panel.tsx` (+test) — UI (Task 6)

**Entorno:** typecheck `./node_modules/.bin/tsc --noEmit`. Tests `npm test`. Build `npm run build`.

---

### Task 1: Modelo laboral

**Files:**
- Create: `src/lib/economy/labor.ts`, `src/lib/economy/labor.test.ts`
- Modify: `src/lib/economy/index.ts`

- [ ] **Step 1: Test**

```ts
import { describe, it, expect } from "vitest";
import {
  LABOR_CONSTANTS,
  actionsPerDay,
  workerUnitsPerDay,
  productionValueForLevel,
  levelForProductionValue,
} from "./labor";

describe("labor model", () => {
  it("actionsPerDay = energía × 24 / (regenDividedBy × energyCostPerAction)", () => {
    // energía 100: 100*24/(10*10) = 24 acciones/día
    expect(actionsPerDay(100, LABOR_CONSTANTS)).toBeCloseTo(24);
    expect(actionsPerDay(50, LABOR_CONSTANTS)).toBeCloseTo(12);
  });

  it("workerUnitsPerDay = acciones × producción × (1+fidelidad%) × throughputFactor", () => {
    // energía 50 → 12 acciones ; producción 40 ; fidelidad 0 → 480
    expect(workerUnitsPerDay(40, 50, 0, LABOR_CONSTANTS)).toBeCloseTo(480);
    // fidelidad 10 → 480 * 1.1 = 528
    expect(workerUnitsPerDay(40, 50, 10, LABOR_CONSTANTS)).toBeCloseTo(528);
  });

  it("productionValueForLevel = 10 + 3×nivel; inversa redondea hacia arriba", () => {
    expect(productionValueForLevel(0)).toBe(10);
    expect(productionValueForLevel(10)).toBe(40);
    expect(levelForProductionValue(40)).toBe(10);
    expect(levelForProductionValue(41)).toBe(11); // ceil
    expect(levelForProductionValue(10)).toBe(0);
  });

  it("LABOR_CONSTANTS no calibrado por defecto", () => {
    expect(LABOR_CONSTANTS.calibrated).toBe(false);
    expect(LABOR_CONSTANTS.throughputFactor).toBe(1);
  });
});
```

- [ ] **Step 2: Correr (debe fallar)**

Run: `npx vitest run src/lib/economy/labor.test.ts` → FAIL.

- [ ] **Step 3: Implementar**

```ts
/**
 * Constantes del modelo laboral. La regen de energía no está 100% documentada,
 * por eso `throughputFactor` es calibrable (Plan 7C). El veredicto de contratación
 * y el salario máximo NO dependen de esto; solo el dimensionamiento del perfil/ganancia.
 */
export interface LaborConstants {
  regenDividedBy: number;
  energyCostPerAction: number;
  hoursPerDay: number;
  throughputFactor: number;
  calibrated: boolean;
}

export const LABOR_CONSTANTS: LaborConstants = {
  regenDividedBy: 10,
  energyCostPerAction: 10,
  hoursPerDay: 24,
  throughputFactor: 1,
  calibrated: false,
};

/** Acciones de trabajo por día a partir del valor de energía. */
export function actionsPerDay(energyValue: number, c: LaborConstants = LABOR_CONSTANTS): number {
  return (energyValue * c.hoursPerDay) / (c.regenDividedBy * c.energyCostPerAction);
}

/** Unidades que produce por día un trabajador con cierta producción, energía y fidelidad. */
export function workerUnitsPerDay(
  productionValue: number,
  energyValue: number,
  fidelity: number,
  c: LaborConstants = LABOR_CONSTANTS,
): number {
  return actionsPerDay(energyValue, c) * productionValue * (1 + fidelity / 100) * c.throughputFactor;
}

/** Valor del skill de producción para un nivel (10 base, +3 por nivel). */
export function productionValueForLevel(level: number): number {
  return 10 + 3 * level;
}

/** Nivel mínimo de skill de producción para alcanzar un valor (redondea hacia arriba). */
export function levelForProductionValue(value: number): number {
  return Math.max(0, Math.ceil((value - 10) / 3));
}
```

- [ ] **Step 4: Correr (pasan) + barrel + tsc**

Run: `npx vitest run src/lib/economy/labor.test.ts` → PASS (4).
Añadir a `src/lib/economy/index.ts`: `export * from "./labor";`
Run: `./node_modules/.bin/tsc --noEmit` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/economy/labor.ts src/lib/economy/labor.test.ts src/lib/economy/index.ts
git commit -m "feat(economy): add labor throughput model"
```

---

### Task 2: Mercado laboral (cliente + resumen)

**Files:**
- Modify: `src/lib/warera/schemas.ts`, `src/lib/warera/client.ts`, `src/lib/warera/schemas.test.ts`, `src/lib/warera/client.test.ts`
- Create: `src/lib/economy/labor-market.ts`, `src/lib/economy/labor-market.test.ts`

- [ ] **Step 1: Tests del schema + cliente**

Añadir a `src/lib/warera/schemas.test.ts`:
```ts
import { workOffersPageSchema } from "./schemas";

describe("workOffersPageSchema", () => {
  it("parsea ofertas con wage/minEnergy/minProduction", () => {
    const p = workOffersPageSchema.parse({
      items: [{ wage: 0.153, minEnergy: 50, minProduction: 50, region: "r1", extra: 1 }],
      nextCursor: null,
    });
    expect(p.items[0].wage).toBeCloseTo(0.153);
    expect(p.items[0].minProduction).toBe(50);
  });
});
```
Añadir a `src/lib/warera/client.test.ts`:
```ts
  it("getWorkOffers envía filtros y parsea", async () => {
    const spy = mockFetchOnce({ items: [{ wage: 0.15, minEnergy: 50, minProduction: 50 }], nextCursor: null });
    const client = new WareraClient();
    const r = await client.getWorkOffers({ regionId: "r1", limit: 20 });
    expect(r.items[0].minEnergy).toBe(50);
    const url = spy.mock.calls[0][0] as string;
    expect(url).toContain("workOffer.getWorkOffersPaginated");
  });
```

- [ ] **Step 2: Correr (deben fallar)**

Run: `npx vitest run src/lib/warera/schemas.test.ts src/lib/warera/client.test.ts` → FAIL.

- [ ] **Step 3: Implementar schema + método**

Añadir a `src/lib/warera/schemas.ts`:
```ts
/** Oferta laboral (de workOffer.getWorkOffersPaginated). */
export const workOfferSchema = z
  .object({
    wage: z.number().optional(),
    minEnergy: z.number().optional(),
    minProduction: z.number().optional(),
    minLevel: z.number().optional(),
    region: z.string().optional(),
  })
  .passthrough();

export const workOffersPageSchema = z.object({
  items: z.array(workOfferSchema),
  nextCursor: z.string().nullable().optional(),
});
```
Añadir a `src/lib/warera/client.ts` (importar `workOffersPageSchema`):
```ts
  getWorkOffers(opts: { regionId?: string; energy?: number; production?: number; limit?: number } = {}) {
    return this.call("workOffer.getWorkOffersPaginated", workOffersPageSchema, {
      ...(opts.regionId ? { regionId: opts.regionId } : {}),
      energy: opts.energy ?? 0,
      production: opts.production ?? 0,
      limit: opts.limit ?? 20,
    });
  }
```

- [ ] **Step 4: Test de `summarizeLaborMarket`**

`src/lib/economy/labor-market.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { summarizeLaborMarket } from "./labor-market";

describe("summarizeLaborMarket", () => {
  it("calcula medianas de wage/minProduction/minEnergy", () => {
    const s = summarizeLaborMarket([
      { wage: 0.1, minProduction: 40, minEnergy: 50 },
      { wage: 0.2, minProduction: 50, minEnergy: 60 },
      { wage: 0.3, minProduction: 60, minEnergy: 70 },
    ]);
    expect(s.count).toBe(3);
    expect(s.medianWage).toBeCloseTo(0.2);
    expect(s.medianMinProduction).toBe(50);
    expect(s.medianMinEnergy).toBe(60);
  });

  it("lista vacía → count 0 y nulls", () => {
    const s = summarizeLaborMarket([]);
    expect(s.count).toBe(0);
    expect(s.medianWage).toBeNull();
  });

  it("ignora campos ausentes al promediar", () => {
    const s = summarizeLaborMarket([{ wage: 0.2 }, { minProduction: 50 }]);
    expect(s.medianWage).toBeCloseTo(0.2);
    expect(s.medianMinProduction).toBe(50);
  });
});
```

- [ ] **Step 5: Correr (debe fallar)**

Run: `npx vitest run src/lib/economy/labor-market.test.ts` → FAIL.

- [ ] **Step 6: Implementar `summarizeLaborMarket`**

`src/lib/economy/labor-market.ts`:
```ts
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
```

- [ ] **Step 7: Correr + barrel + suite + tsc**

Run: `npx vitest run src/lib/warera/schemas.test.ts src/lib/warera/client.test.ts src/lib/economy/labor-market.test.ts` → PASS.
Añadir a `src/lib/economy/index.ts`: `export * from "./labor-market";`
Run: `npm test` → verde; `./node_modules/.bin/tsc --noEmit` → exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/lib/warera/schemas.ts src/lib/warera/schemas.test.ts src/lib/warera/client.ts src/lib/warera/client.test.ts src/lib/economy/labor-market.ts src/lib/economy/labor-market.test.ts src/lib/economy/index.ts
git commit -m "feat: add labor market client and summary"
```

---

### Task 3: Helper de venta real/día (`realizedSalesPerDay`) + refactor de calibración

**Files:**
- Create: `src/server/sell-rate.ts`, `src/server/sell-rate.test.ts`
- Modify: `src/server/calibrate.ts`

- [ ] **Step 1: Test**

`src/server/sell-rate.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { realizedSalesPerDay } from "./sell-rate";

const NOW = Date.parse("2026-06-10T00:00:00.000Z");
const recent = "2026-06-09T00:00:00.000Z";
const old = "2026-01-01T00:00:00.000Z";

function client(items: { sellerId?: string; quantity?: number; createdAt?: string }[]) {
  return { getUserItemTransactions: async () => ({ items, nextCursor: null }) } as never;
}

describe("realizedSalesPerDay", () => {
  it("suma ventas del usuario en la ventana / días", async () => {
    const r = await realizedSalesPerDay(client([
      { sellerId: "u1", quantity: 350, createdAt: recent },
      { sellerId: "OTHER", quantity: 999, createdAt: recent },
    ]), "u1", "steel", 7, NOW);
    expect(r).toBeCloseTo(50); // 350/7
  });

  it("sin ventas → null", async () => {
    const r = await realizedSalesPerDay(client([{ sellerId: "u1", quantity: 5, createdAt: old }]), "u1", "steel", 7, NOW);
    expect(r).toBeNull();
  });
});
```

- [ ] **Step 2: Correr (debe fallar)**

Run: `npx vitest run src/server/sell-rate.test.ts` → FAIL.

- [ ] **Step 3: Implementar**

`src/server/sell-rate.ts`:
```ts
import type { WareraClient } from "@/lib/warera/client";

const MAX_PAGES = 10;

/**
 * Unidades vendidas por el usuario (sellerId == userId) de un item, por día, en la ventana.
 * Devuelve null si no hubo ventas en la ventana. Asume paginación de más nuevo a más viejo.
 */
export async function realizedSalesPerDay(
  client: WareraClient,
  userId: string,
  itemCode: string,
  days: number,
  now: number = Date.now(),
): Promise<number | null> {
  const since = now - days * 24 * 60 * 60 * 1000;
  let soldQty = 0;
  let hadSale = false;
  let cursor: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await client.getUserItemTransactions(userId, itemCode, cursor);
    let reachedOld = false;
    for (const tx of res.items) {
      const ts = tx.createdAt ? Date.parse(tx.createdAt) : NaN;
      if (Number.isNaN(ts)) continue;
      if (ts < since) {
        reachedOld = true;
        continue;
      }
      if (tx.sellerId === userId && typeof tx.quantity === "number") {
        soldQty += tx.quantity;
        hadSale = true;
      }
    }
    cursor = res.nextCursor ?? undefined;
    if (!cursor || reachedOld) break;
  }

  return hadSale ? soldQty / days : null;
}
```

- [ ] **Step 4: Refactor `calibrate.ts` para reusar el helper (DRY)**

En `src/server/calibrate.ts`, reemplazar el bucle interno de paginación por una llamada al helper. Dentro del `for (const [itemCode, production] of productionByItem)`:
```ts
    const realized = await realizedSalesPerDay(client, opts.userId, itemCode, opts.days, now);
    const realizedPerDay = realized ?? 0;
    rows.push({ itemCode, productionPerDay: production, realizedPerDay });
    if (realized !== null) {
      totalProduction += production;
      totalRealized += realizedPerDay;
      samples++;
    }
```
Importar: `import { realizedSalesPerDay } from "./sell-rate";` y eliminar la constante `MAX_PAGES` local y el bucle de paginación que quedó sin uso.

- [ ] **Step 5: Correr (pasan, calibración sigue verde) + tsc**

Run: `npx vitest run src/server/sell-rate.test.ts src/server/calibrate.test.ts` → PASS (los tests de calibración siguen verdes: misma matemática).
Run: `./node_modules/.bin/tsc --noEmit` → exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/server/sell-rate.ts src/server/sell-rate.test.ts src/server/calibrate.ts
git commit -m "feat(server): extract realizedSalesPerDay; reuse in calibration"
```

---

### Task 4: Recomendador de contratación (puro)

**Files:**
- Create: `src/lib/economy/hiring-recommender.ts`, `src/lib/economy/hiring-recommender.test.ts`
- Modify: `src/lib/economy/index.ts`

- [ ] **Step 1: Test**

```ts
import { describe, it, expect } from "vitest";
import { hiringRecommendation } from "./hiring-recommender";
import { LABOR_CONSTANTS } from "./labor";

const base = {
  marginPerUnit: 1.3,
  maxWagePerPoint: 1.17,
  automationDailyProd: 72,
  currentDailyRate: 72,
  freeSlots: 2,
  laborConstants: LABOR_CONSTANTS,
  market: { count: 5, medianWage: 0.5, medianMinProduction: 50, medianMinEnergy: 50 },
};

describe("hiringRecommendation", () => {
  it("no viable si el margen es <= 0", () => {
    const r = hiringRecommendation({ ...base, marginPerUnit: -0.1, maxWagePerPoint: -0.1 });
    expect(r.viable).toBe(false);
    expect(r.reason).toBe("item_unprofitable");
  });

  it("no viable si no hay slots libres", () => {
    const r = hiringRecommendation({ ...base, freeSlots: 0 });
    expect(r.viable).toBe(false);
    expect(r.reason).toBe("no_slots");
  });

  it("no viable si la venta no supera la producción actual (sin demanda)", () => {
    const r = hiringRecommendation({ ...base, sellPerDay: 60 }); // vende 60 < produce 72
    expect(r.viable).toBe(false);
    expect(r.reason).toBe("no_demand");
  });

  it("viable con demanda: salario máx, salario sugerido ≤ máx y perfil del mercado", () => {
    const r = hiringRecommendation({ ...base, sellPerDay: 200 }); // headroom 128
    expect(r.viable).toBe(true);
    expect(r.maxWagePerPoint).toBeCloseTo(1.17);
    expect(r.suggestedWage).toBeLessThanOrEqual(1.17);
    expect(r.suggestedWage).toBeGreaterThan(0);
    expect(r.recommendedProfile.minProduction).toBeGreaterThan(0);
    expect(r.recommendedProfile.minEnergy).toBeGreaterThan(0);
    expect(r.recommendedProfile.minLevel).toBeGreaterThanOrEqual(0);
    expect(r.expectedDailyGain).toBeGreaterThan(0);
  });

  it("sin venta (sin token): viable pero marcado como supuesto", () => {
    const r = hiringRecommendation({ ...base }); // sin sellPerDay
    expect(r.viable).toBe(true);
    expect(r.demandKnown).toBe(false);
  });
});
```

- [ ] **Step 2: Correr (debe fallar)**

Run: `npx vitest run src/lib/economy/hiring-recommender.test.ts` → FAIL.

- [ ] **Step 3: Implementar**

```ts
import { workerUnitsPerDay, levelForProductionValue, type LaborConstants } from "./labor";
import type { LaborMarketSummary } from "./labor-market";

export type HiringReason = "item_unprofitable" | "no_slots" | "no_demand" | "ok";

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
}

const EMPTY_PROFILE: RecommendedProfile = { minProduction: 0, minEnergy: 0, minLevel: 0 };

export function hiringRecommendation(args: {
  marginPerUnit: number;
  maxWagePerPoint: number;
  automationDailyProd: number;
  currentDailyRate: number;
  freeSlots: number;
  sellPerDay?: number;
  market: LaborMarketSummary;
  laborConstants: LaborConstants;
}): HiringRecommendation {
  const demandKnown = args.sellPerDay !== undefined;
  const baseOut = {
    maxWagePerPoint: args.maxWagePerPoint,
    suggestedWage: 0,
    freeSlots: args.freeSlots,
    demandKnown,
    recommendedProfile: EMPTY_PROFILE,
    expectedDailyGain: 0,
  };

  if (args.marginPerUnit <= 0) return { ...baseOut, viable: false, reason: "item_unprofitable" };
  if (args.freeSlots <= 0) return { ...baseOut, viable: false, reason: "no_slots" };

  // Espacio de demanda: cuántas unidades/día extra podés vender por encima de lo que ya producís.
  const headroom = demandKnown ? (args.sellPerDay as number) - args.currentDailyRate : Infinity;
  if (demandKnown && headroom <= 0) return { ...baseOut, viable: false, reason: "no_demand" };

  // Perfil sugerido: cubrir el headroom con los slots libres (si se conoce); si no, usar el mercado.
  const energy = args.market.medianMinEnergy ?? 50;
  const targetUnitsPerWorker = Number.isFinite(headroom) ? headroom / args.freeSlots : Infinity;

  let minProduction: number;
  if (Number.isFinite(targetUnitsPerWorker)) {
    // Invertir el modelo laboral para hallar la producción que rinde esas unidades a esa energía.
    const oneUnitAtProd1 = workerUnitsPerDay(1, energy, 0, args.laborConstants); // unidades/día por punto de producción
    const needed = oneUnitAtProd1 > 0 ? targetUnitsPerWorker / oneUnitAtProd1 : 0;
    minProduction = Math.max(args.market.medianMinProduction ?? 0, Math.ceil(needed));
  } else {
    minProduction = args.market.medianMinProduction ?? 50;
  }
  const minEnergy = energy;
  const minLevel = levelForProductionValue(minProduction);

  // Salario sugerido: por debajo del máximo y alineado al mercado.
  const marketWage = args.market.medianWage ?? args.maxWagePerPoint * 0.85;
  const suggestedWage = Math.max(0, Math.min(args.maxWagePerPoint * 0.95, marketWage));

  // Ganancia esperada/día: unidades que aporta el perfil sugerido (limitadas por headroom y slots)
  // por el margen restante después de pagar el salario sugerido.
  const perWorkerUnits = workerUnitsPerDay(minProduction, minEnergy, 0, args.laborConstants);
  const totalWorkerUnits = perWorkerUnits * args.freeSlots;
  const addressable = Number.isFinite(headroom) ? Math.min(totalWorkerUnits, headroom) : totalWorkerUnits;
  const expectedDailyGain = addressable * Math.max(0, args.maxWagePerPoint - suggestedWage);

  return {
    ...baseOut,
    viable: true,
    reason: "ok",
    suggestedWage,
    recommendedProfile: { minProduction, minEnergy, minLevel },
    expectedDailyGain,
  };
}
```

- [ ] **Step 4: Correr (pasan) + barrel + tsc**

Run: `npx vitest run src/lib/economy/hiring-recommender.test.ts` → PASS (5).
Añadir a `src/lib/economy/index.ts`: `export * from "./hiring-recommender";`
Run: `./node_modules/.bin/tsc --noEmit` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/economy/hiring-recommender.ts src/lib/economy/hiring-recommender.test.ts src/lib/economy/index.ts
git commit -m "feat(economy): add hiring recommendation engine"
```

---

### Task 5: Enriquecer `buildCompanyDetail` con la recomendación

**Files:**
- Modify: `src/server/company-detail.ts`, `src/server/company-detail.test.ts`

- [ ] **Step 1: Actualizar el test**

Añadir al `getGameConfig` fake el `upgradesConfig.breakRoom` (para slots) y agregar al cliente fake `getWorkOffers`. Añadir un test del campo `hiring`:
```ts
    getGameConfig: async () => ({
      items: { bread: { type: "product", productionPoints: 1, productionNeeds: { grain: 2 } } },
      upgradesConfig: {
        automatedEngine: { levels: { "3": { stats: { dailyProd: 72 } } } },
        storage: { levels: { "1": { stats: { maxProduction: 200 } } } },
        breakRoom: { levels: { "1": { stats: { maxWorkers: 2 } } } },
      },
    }),
    getWorkOffers: async () => ({ items: [{ wage: 0.5, minEnergy: 50, minProduction: 50 }], nextCursor: null }),
    getUserItemTransactions: async () => ({ items: [], nextCursor: null }),
```
Y una aserción nueva:
```ts
  it("incluye la recomendación de contratación", async () => {
    const d = await buildCompanyDetail(fakeClient(), { companyId: "c1", userId: "u1", authenticated: true });
    expect(d.hiring).toBeDefined();
    expect(typeof d.hiring.viable).toBe("boolean");
    expect(d.hiring.maxWagePerPoint).toBeCloseTo(d.report.maxWageToHire);
    expect(d.hiring.freeSlots).toBe(2); // maxWorkers 2 - workerCount 0
  });
```
(Ajustar el `company` fake para `workerCount: 0` si no lo está; con automatedEngine 3 y breakRoom 1 → freeSlots 2.)

- [ ] **Step 2: Correr (debe fallar)**

Run: `npx vitest run src/server/company-detail.test.ts` → FAIL.

- [ ] **Step 3: Implementar**

En `src/server/company-detail.ts`:
1. Importar: `maxWorkers`, `LABOR_CONSTANTS`, `summarizeLaborMarket`, `hiringRecommendation` desde `@/lib/economy`; `realizedSalesPerDay` desde `./sell-rate`; tipo `HiringRecommendation`.
2. Calcular `sellPerDay` (solo con auth) y la recomendación, y agregarlos al `CompanyDetail`.

Añadir a la interface `CompanyDetail`: `hiring: HiringRecommendation;` y `sellPerDay: number | null;`.

Después de armar `report` (y de tener `prices`, `taxes`, `gameConfig`, `c`):
```ts
  const sellPerDay = opts.authenticated
    ? await realizedSalesPerDay(client, opts.userId, c.itemCode, 7)
    : null;

  // Recalcular el report con sellPerDay si lo conocemos (afecta usefulRate).
  const reportWithSell = assembleCompanyReport({
    company, item, workers, prices, taxes,
    upgradesConfig: gameConfig.upgradesConfig,
    sellPerDay: sellPerDay ?? undefined,
  });

  const offers = await client.getWorkOffers({ limit: 20 }).then((r) => r.items).catch(() => []);
  const market = summarizeLaborMarket(offers);
  const slots = maxWorkers(gameConfig.upgradesConfig, c.activeUpgradeLevels.breakRoom);
  const hiring = hiringRecommendation({
    marginPerUnit: reportWithSell.marginPerUnit,
    maxWagePerPoint: reportWithSell.maxWageToHire,
    automationDailyProd: reportWithSell.dailyProductionRate,
    currentDailyRate: reportWithSell.dailyProductionRate,
    freeSlots: Math.max(0, slots - c.workerCount),
    sellPerDay: sellPerDay ?? undefined,
    market,
    laborConstants: LABOR_CONSTANTS,
  });
```
Usar `reportWithSell` como el `report` devuelto, y devolver `hiring` + `sellPerDay` en el objeto `CompanyDetail`. (Reemplazar el `report` anterior por `reportWithSell`, o construir directamente con sellPerDay.)

- [ ] **Step 4: Correr (pasan) + suite + tsc**

Run: `npx vitest run src/server/company-detail.test.ts` → PASS.
Run: `npm test` → verde; `./node_modules/.bin/tsc --noEmit` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/server/company-detail.ts src/server/company-detail.test.ts
git commit -m "feat(server): add hiring recommendation to company detail"
```

---

### Task 6: UI — panel "Contratación"

**Files:**
- Create: `src/components/detail/hiring-panel.tsx`, `src/components/detail/hiring-panel.test.tsx`
- Modify: `src/app/company/[id]/page.tsx`

- [ ] **Step 1: Implementar el panel**

`src/components/detail/hiring-panel.tsx`:
```tsx
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserPlus, CheckCircle2, XCircle } from "lucide-react";
import { formatMoney } from "@/lib/format";
import type { HiringRecommendation } from "@/lib/economy";

const REASON: Record<string, string> = {
  item_unprofitable: "El producto no deja margen: no conviene producir.",
  no_slots: "No hay slots libres (subí la Sala de descanso).",
  no_demand: "Ya producís más de lo que vendés: contratar solo llenaría el almacén.",
  ok: "Conviene contratar.",
};

export function HiringPanel({ hiring }: { hiring: HiringRecommendation }) {
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

      {hiring.viable ? (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Salario máx /punto</dt>
          <dd className="tabular text-right">{formatMoney(hiring.maxWagePerPoint)}</dd>
          <dt className="text-muted-foreground">Salario sugerido /punto</dt>
          <dd className="tabular text-right text-accent">{formatMoney(hiring.suggestedWage)}</dd>
          <dt className="text-muted-foreground">Slots libres</dt>
          <dd className="tabular text-right">{hiring.freeSlots}</dd>
          <dt className="text-muted-foreground">Ganancia extra/día (est.)</dt>
          <dd className="tabular text-right text-success">{formatMoney(hiring.expectedDailyGain)}</dd>
        </dl>
      ) : null}

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
    </Card>
  );
}
```

- [ ] **Step 2: Test del panel**

`src/components/detail/hiring-panel.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HiringPanel } from "./hiring-panel";

describe("HiringPanel", () => {
  it("muestra el perfil y salarios cuando conviene", () => {
    render(
      <HiringPanel
        hiring={{
          viable: true, reason: "ok", maxWagePerPoint: 1.17, suggestedWage: 0.5, freeSlots: 2,
          demandKnown: true, recommendedProfile: { minProduction: 50, minEnergy: 50, minLevel: 14 },
          expectedDailyGain: 80,
        }}
      />,
    );
    expect(screen.getByText("Conviene contratar")).toBeInTheDocument();
    expect(screen.getByText("min producción: 50")).toBeInTheDocument();
  });

  it("muestra el motivo cuando no conviene", () => {
    render(
      <HiringPanel
        hiring={{
          viable: false, reason: "no_demand", maxWagePerPoint: 1.17, suggestedWage: 0, freeSlots: 2,
          demandKnown: true, recommendedProfile: { minProduction: 0, minEnergy: 0, minLevel: 0 }, expectedDailyGain: 0,
        }}
      />,
    );
    expect(screen.getByText("No conviene")).toBeInTheDocument();
    expect(screen.getByText(/llenaría el almacén/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Insertar el panel en el detalle**

En `src/app/company/[id]/page.tsx`, importar `HiringPanel` y renderizarlo. Reemplazar el `WorkersPanel` dentro del grid de 2 columnas por un sub-grid o añadir el `HiringPanel` debajo del grid Breakdown/Workers:
```tsx
import { HiringPanel } from "@/components/detail/hiring-panel";
// ... dentro del bloque `data ?`, después del grid Breakdown/Workers:
              <HiringPanel hiring={data.hiring} />
```
(Colocarlo después del `<div className="grid ... lg:grid-cols-2"> ... </div>` que contiene Breakdown y WorkersPanel, antes de la card de Mejoras.)

- [ ] **Step 4: Correr tests + tsc + build**

Run: `npx vitest run src/components/detail/hiring-panel.test.tsx` → PASS.
Run: `npm test` → verde; `./node_modules/.bin/tsc --noEmit` → exit 0; `npm run build` → compila.

- [ ] **Step 5: Commit**

```bash
git add src/components/detail/hiring-panel.tsx src/components/detail/hiring-panel.test.tsx "src/app/company/[id]/page.tsx"
git commit -m "feat(ui): add hiring recommendation panel to company detail"
```

---

## Verificación final del Plan 7B

- [ ] `npm test` → todos verdes (Plan 1–7A + nuevos: labor, labor-market, sell-rate, hiring-recommender, schemas/client de ofertas, company-detail).
- [ ] `./node_modules/.bin/tsc --noEmit` → exit 0.
- [ ] `npm run build` → compila.
- [ ] Flujo en vivo (BebetoSan): en el detalle de una empresa aparece el panel "Contratación" con veredicto, salario máx/sugerido por punto, slots libres y perfil sugerido (minProd/minEnergía/minNivel). Sin token: marca "venta supuesta"; con token: usa tu venta real para el veredicto de demanda.
- [ ] Verificación visual con Playwright del panel "Contratación".

## Notas para el Plan 7C (parche de calibración + aporte de trabajadores)

- **Parche de calibración:** reorientar `runCalibration` a un **factor de tasa** = `Σ ventaReal/día ÷ Σ tasaModelada` (automatización), persistido y aplicado a `dailyProductionRate` (reusa store/endpoint/página; cambia el significado y los textos). Para empresas sin trabajadores valida la automatización (factor≈1).
- **Aporte de trabajadores a la tasa actual:** verificar el shape de `worker.getWorkers` (con token) y, si trae producción/energía/fidelidad, sumar `workerUnitsPerDay` a `dailyProductionRate` en los reportes.
- **Calibrar `LABOR_CONSTANTS.throughputFactor`** con datos reales (empresas con trabajadores).
