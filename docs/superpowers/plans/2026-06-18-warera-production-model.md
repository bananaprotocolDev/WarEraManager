# WarEra Company Manager — Plan 7A: Modelo de producción corregido

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corregir el cálculo de producción/beneficio: la producción diaria deja de leerse del campo `production` (que es **stock**) y pasa a calcularse de forma determinística desde `gameConfig` (automatización), topeada por almacén y por la venta diaria; el detalle muestra stock vs tope de almacén.

**Architecture:** Helpers puros leen `gameConfig.upgradesConfig` (`automationDailyProd`, `storageMax`, `maxWorkers`). `companyProfit` se reescribe para recibir una **tasa diaria** y una venta/día opcional (no el stock). `assembleCompanyReport` arma la tasa desde la automatización de la empresa y expone stock + tope de almacén. El aporte de trabajadores y la calibración del throughput laboral llegan en el Plan 7B; aquí la tasa = automatización (determinística, gran corrección sobre usar el stock). `hiringAnalysis` (marginal, obsoleto) se reemplaza por `maxWagePerPoint` (margen por unidad después de impuesto). La UI muestra la tasa correcta + barra de almacén.

**Tech Stack:** Next.js 16, TypeScript, Zod, Vitest.

Spec: `docs/superpowers/specs/2026-06-18-production-model-and-hiring-design.md` (Parte A). Plan 7B cubre el recomendador + modelo laboral + parche de calibración.

---

## Decisiones de alcance (7A)

- **Tasa diaria = automatización** (`automatedEngine.dailyProd[nivel]`, exacto desde gameConfig). El aporte de trabajadores se suma en el Plan 7B (con el modelo laboral). Aun sin trabajadores, esto corrige el error grande (hoy se usa el stock, ej. 191, como tasa).
- **`production` = stock**: se muestra como inventario actual vs `storage.maxProduction[nivel]`. No se usa como tasa.
- **Venta/día opcional**: si se pasa `sellPerDay`, `tasaUtil = min(tasa, sellPerDay)`; si no, `tasaUtil = tasa` y se marca `sellAssumed`. En 7A no se consulta venta real (eso es 7B/calibración); `sellPerDay` queda como parámetro para 7B.
- **`maxWagePerPoint` = margen** `(precio − costoInsumosPorUnidad) × (1 − impuestoMercado)`. Reemplaza el `hiringAnalysis` marginal (obsoleto: usaba `production/workerCount`).
- **Calibración (6A):** NO se toca en 7A (queda inofensiva). El `constants` (productionToUnitsPerDay) deja de afectar a `companyProfit`; el flag `estimated` ahora refleja `sellAssumed`. El parche real de calibración es 7B.

## Estructura de archivos

- `src/lib/warera/schemas.ts` (+test) — `upgradesConfigSchema` en gameConfig; `storage` en company (Task 1)
- `src/lib/economy/upgrades.ts` (+test) — helpers automationDailyProd/storageMax/maxWorkers (Task 2)
- `src/lib/economy/profit.ts` (+test) — reescritura `companyProfit` (Task 3)
- `src/lib/economy/hiring.ts` (+test) — reemplazo por `maxWagePerPoint` (Task 4)
- `src/lib/economy/types.ts`, `src/lib/economy/index.ts` — tipos/barrel (Tasks 3–4)
- `src/server/company-report.ts` (+test) — reescritura `assembleCompanyReport` (Task 5)
- `src/server/portfolio.ts`, `src/server/company-detail.ts` (+tests) — pasar upgradesConfig (Task 6)
- `src/components/dashboard/company-card.tsx` (+test), `src/components/detail/breakdown.tsx` (+test), `src/app/company/[id]/page.tsx` — UI (Task 7)

**Entorno:** typecheck `./node_modules/.bin/tsc --noEmit`. Tests `npm test`. Build `npm run build`.

---

### Task 1: Schemas — `upgradesConfig` + `storage`

**Files:**
- Modify: `src/lib/warera/schemas.ts`, `src/lib/warera/schemas.test.ts`

- [ ] **Step 1: Tests**

Añadir a `src/lib/warera/schemas.test.ts`:
```ts
import { gameConfigSchema as gcSchema2, companySchema as cSchema2 } from "./schemas";

describe("upgradesConfig + storage", () => {
  it("parsea upgradesConfig con niveles y stats", () => {
    const gc = gcSchema2.parse({
      items: {},
      upgradesConfig: {
        automatedEngine: { levels: { "1": { stats: { dailyProd: 24 } }, "3": { stats: { dailyProd: 72 } } } },
        storage: { levels: { "1": { stats: { maxProduction: 200 } } } },
        breakRoom: { levels: { "2": { stats: { maxWorkers: 4, dailyHires: 4 } } } },
      },
    });
    expect(gc.upgradesConfig.automatedEngine?.levels["3"].stats.dailyProd).toBe(72);
    expect(gc.upgradesConfig.storage?.levels["1"].stats.maxProduction).toBe(200);
  });

  it("company incluye storage en activeUpgradeLevels (default 0)", () => {
    const c = cSchema2.parse({
      _id: "c1",
      itemCode: "steel",
      production: 191,
      workerCount: 0,
      activeUpgradeLevels: { automatedEngine: 3, breakRoom: 1 },
    });
    expect(c.activeUpgradeLevels.storage).toBe(0);
    const c2 = cSchema2.parse({
      _id: "c2", itemCode: "oil", production: 8, workerCount: 1,
      activeUpgradeLevels: { automatedEngine: 5, breakRoom: 1, storage: 2 },
    });
    expect(c2.activeUpgradeLevels.storage).toBe(2);
  });
});
```

- [ ] **Step 2: Correr (deben fallar)**

Run: `npx vitest run src/lib/warera/schemas.test.ts` → FAIL.

- [ ] **Step 3: Implementar**

En `src/lib/warera/schemas.ts`:

1) Añadir el storage al transform de `activeUpgradeLevels` dentro de `companySchema`. Reemplazar ese bloque por:
```ts
    activeUpgradeLevels: z
      .object({
        automatedEngine: z.number().default(0),
        breakRoom: z.number().default(0),
        storage: z.number().default(0),
      })
      .partial()
      .transform((u) => ({
        automatedEngine: u.automatedEngine ?? 0,
        breakRoom: u.breakRoom ?? 0,
        storage: u.storage ?? 0,
      }))
      .default({ automatedEngine: 0, breakRoom: 0, storage: 0 }),
```

2) Añadir los schemas de upgrades y sumarlos a `gameConfigSchema`:
```ts
const upgradeLevelSchema = z
  .object({ stats: z.record(z.string(), z.number()).default({}) })
  .passthrough();

const upgradeSchema = z
  .object({ levels: z.record(z.string(), upgradeLevelSchema).default({}) })
  .passthrough();

export const upgradesConfigSchema = z
  .object({
    automatedEngine: upgradeSchema.optional(),
    storage: upgradeSchema.optional(),
    breakRoom: upgradeSchema.optional(),
  })
  .passthrough();
```
Y en `gameConfigSchema`, añadir el campo `upgradesConfig`:
```ts
    upgradesConfig: upgradesConfigSchema.default({}),
```
(Mantener el `items` con su preprocess tal como está.)

- [ ] **Step 4: Correr (pasan) + suite + tsc**

Run: `npx vitest run src/lib/warera/schemas.test.ts` → PASS.
Run: `npm test` → verde (los demás siguen pasando — `storage` se agrega con default).
Run: `./node_modules/.bin/tsc --noEmit` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/warera/schemas.ts src/lib/warera/schemas.test.ts
git commit -m "feat(warera): parse upgradesConfig and company storage level"
```

---

### Task 2: Helpers de upgrades (puros)

**Files:**
- Create: `src/lib/economy/upgrades.ts`, `src/lib/economy/upgrades.test.ts`

- [ ] **Step 1: Test**

```ts
import { describe, it, expect } from "vitest";
import { automationDailyProd, storageMax, maxWorkers } from "./upgrades";

const uc = {
  automatedEngine: { levels: { "1": { stats: { dailyProd: 24 } }, "3": { stats: { dailyProd: 72 } } } },
  storage: { levels: { "1": { stats: { maxProduction: 200 } }, "2": { stats: { maxProduction: 400 } } } },
  breakRoom: { levels: { "2": { stats: { maxWorkers: 4 } } } },
};

describe("upgrade helpers", () => {
  it("automationDailyProd por nivel", () => {
    expect(automationDailyProd(uc, 3)).toBe(72);
    expect(automationDailyProd(uc, 1)).toBe(24);
  });
  it("nivel 0 o desconocido → 0", () => {
    expect(automationDailyProd(uc, 0)).toBe(0);
    expect(automationDailyProd(uc, 9)).toBe(0);
    expect(automationDailyProd({}, 3)).toBe(0);
  });
  it("storageMax y maxWorkers", () => {
    expect(storageMax(uc, 2)).toBe(400);
    expect(maxWorkers(uc, 2)).toBe(4);
    expect(storageMax(uc, 0)).toBe(0);
  });
});
```

- [ ] **Step 2: Correr (debe fallar)**

Run: `npx vitest run src/lib/economy/upgrades.test.ts` → FAIL.

- [ ] **Step 3: Implementar**

```ts
interface UpgradeLevel {
  stats?: Record<string, number>;
}
interface UpgradeDef {
  levels?: Record<string, UpgradeLevel>;
}
export interface UpgradesConfig {
  automatedEngine?: UpgradeDef;
  storage?: UpgradeDef;
  breakRoom?: UpgradeDef;
}

function stat(def: UpgradeDef | undefined, level: number, key: string): number {
  return def?.levels?.[String(level)]?.stats?.[key] ?? 0;
}

/** Producción diaria de la automatización (unidades/día) para un nivel de automatedEngine. */
export function automationDailyProd(uc: UpgradesConfig, level: number): number {
  return stat(uc.automatedEngine, level, "dailyProd");
}

/** Tope de stock del almacén para un nivel de storage. */
export function storageMax(uc: UpgradesConfig, level: number): number {
  return stat(uc.storage, level, "maxProduction");
}

/** Máximo de trabajadores para un nivel de breakRoom. */
export function maxWorkers(uc: UpgradesConfig, level: number): number {
  return stat(uc.breakRoom, level, "maxWorkers");
}
```

- [ ] **Step 4: Correr (pasan) + tsc**

Run: `npx vitest run src/lib/economy/upgrades.test.ts` → PASS.
Run: `./node_modules/.bin/tsc --noEmit` → exit 0.

- [ ] **Step 5: Añadir al barrel + commit**

Añadir a `src/lib/economy/index.ts`: `export * from "./upgrades";`
```bash
git add src/lib/economy/upgrades.ts src/lib/economy/upgrades.test.ts src/lib/economy/index.ts
git commit -m "feat(economy): add upgrade config helpers"
```

---

### Task 3: Reescribir `companyProfit` (modelo de tasa diaria)

**Files:**
- Modify: `src/lib/economy/profit.ts`, `src/lib/economy/profit.test.ts`

- [ ] **Step 1: Reescribir el test**

Reemplazar TODO el contenido de `src/lib/economy/profit.test.ts` por:
```ts
import { describe, it, expect } from "vitest";
import { companyProfit } from "./profit";
import type { ItemDef, PriceMap, Taxes } from "./types";

const bread: ItemDef = { code: "bread", type: "product", productionPoints: 1, productionNeeds: { grain: 2 } };
const prices: PriceMap = { bread: 1.5, grain: 0.1 };
const taxes: Taxes = { income: 0, market: 10, selfWork: 0 };

describe("companyProfit (tasa diaria)", () => {
  it("usa la tasa diaria, no el stock", () => {
    const r = companyProfit({ dailyProductionRate: 72, item: bread, prices, taxes, wageCostPerDay: 0 });
    expect(r.dailyProductionRate).toBe(72);
    expect(r.usefulRate).toBe(72); // sin sellPerDay, util = tasa
    // ingresos = 72 * 1.5 = 108
    expect(r.revenue).toBeCloseTo(108);
    // inputs = 72 * 2 * 0.1 = 14.4
    expect(r.inputCost).toBeCloseTo(14.4);
    // impuesto = 108 * 0.10 = 10.8
    expect(r.tax).toBeCloseTo(10.8);
    // neto = 108 - 14.4 - 0 - 10.8 = 82.8
    expect(r.netProfit).toBeCloseTo(82.8);
    expect(r.sellAssumed).toBe(true);
    expect(r.estimated).toBe(true);
  });

  it("topea por venta/día cuando se provee sellPerDay", () => {
    const r = companyProfit({ dailyProductionRate: 72, sellPerDay: 30, item: bread, prices, taxes });
    expect(r.usefulRate).toBe(30); // min(72, 30)
    expect(r.revenue).toBeCloseTo(45); // 30*1.5
    expect(r.sellAssumed).toBe(false);
    expect(r.estimated).toBe(false);
  });

  it("descuenta salarios y usa precio 0 si falta", () => {
    const r = companyProfit({ dailyProductionRate: 10, item: bread, prices: {}, taxes, wageCostPerDay: 5 });
    expect(r.revenue).toBe(0);
    expect(r.wageCost).toBe(5);
    expect(r.netProfit).toBe(-5);
  });
});
```

- [ ] **Step 2: Correr (debe fallar)**

Run: `npx vitest run src/lib/economy/profit.test.ts` → FAIL.

- [ ] **Step 3: Reescribir `src/lib/economy/profit.ts`**

```ts
import type { ItemDef, PriceMap, Taxes } from "./types";

export interface ProfitBreakdown {
  /** Producción diaria total (automatización + trabajadores). */
  dailyProductionRate: number;
  /** Tasa efectiva vendible: min(tasa, venta/día). */
  usefulRate: number;
  revenue: number;
  inputCost: number;
  wageCost: number;
  tax: number;
  netProfit: number;
  /** true si no se proveyó venta/día y se asumió vender todo lo producido. */
  sellAssumed: boolean;
  /** true si alguna parte de la cifra es un supuesto (hoy: venta asumida). */
  estimated: boolean;
}

export function companyProfit(args: {
  dailyProductionRate: number;
  sellPerDay?: number;
  item: ItemDef;
  prices: PriceMap;
  taxes: Taxes;
  wageCostPerDay?: number;
}): ProfitBreakdown {
  const sellAssumed = args.sellPerDay === undefined;
  const usefulRate = sellAssumed ? args.dailyProductionRate : Math.min(args.dailyProductionRate, args.sellPerDay as number);

  const price = args.prices[args.item.code] ?? 0;
  const revenue = usefulRate * price;

  let inputCost = 0;
  for (const [inputCode, qtyPerUnit] of Object.entries(args.item.productionNeeds)) {
    inputCost += qtyPerUnit * usefulRate * (args.prices[inputCode] ?? 0);
  }

  const wageCost = args.wageCostPerDay ?? 0;
  const tax = revenue * ((args.taxes.market ?? 0) / 100);
  const netProfit = revenue - inputCost - wageCost - tax;

  return {
    dailyProductionRate: args.dailyProductionRate,
    usefulRate,
    revenue,
    inputCost,
    wageCost,
    tax,
    netProfit,
    sellAssumed,
    estimated: sellAssumed,
  };
}
```

- [ ] **Step 4: Correr (pasan) + tsc**

Run: `npx vitest run src/lib/economy/profit.test.ts` → PASS (3).
Run: `./node_modules/.bin/tsc --noEmit` → habrá errores en consumidores (profit.ts cambió de firma). Eso se arregla en Tasks 5–7. Por ahora, el test del módulo pasa.

- [ ] **Step 5: Commit**

```bash
git add src/lib/economy/profit.ts src/lib/economy/profit.test.ts
git commit -m "feat(economy): rewrite companyProfit to daily-rate model"
```

---

### Task 4: Reemplazar `hiringAnalysis` por `maxWagePerPoint`

**Files:**
- Modify: `src/lib/economy/hiring.ts`, `src/lib/economy/hiring.test.ts`

- [ ] **Step 1: Reescribir el test**

Reemplazar TODO `src/lib/economy/hiring.test.ts` por:
```ts
import { describe, it, expect } from "vitest";
import { maxWagePerPoint } from "./hiring";
import type { ItemDef, PriceMap, Taxes } from "./types";

const bread: ItemDef = { code: "bread", type: "product", productionPoints: 1, productionNeeds: { grain: 2 } };
const prices: PriceMap = { bread: 1.5, grain: 0.1 };

describe("maxWagePerPoint", () => {
  it("margen por unidad después de impuesto = precio - insumos, neto de impuesto", () => {
    const r = maxWagePerPoint(bread, prices, { income: 0, market: 10, selfWork: 0 });
    // margen bruto = 1.5 - (2*0.1) = 1.3 ; después de 10% = 1.17
    expect(r.marginPerUnit).toBeCloseTo(1.3);
    expect(r.maxWage).toBeCloseTo(1.17);
  });

  it("si el margen es negativo, maxWage también (no conviene producir)", () => {
    const r = maxWagePerPoint(bread, { bread: 0.1, grain: 0.1 }, { income: 0, market: 0, selfWork: 0 });
    // 0.1 - 0.2 = -0.1
    expect(r.marginPerUnit).toBeCloseTo(-0.1);
    expect(r.maxWage).toBeCloseTo(-0.1);
  });
});
```

- [ ] **Step 2: Correr (debe fallar)**

Run: `npx vitest run src/lib/economy/hiring.test.ts` → FAIL.

- [ ] **Step 3: Reescribir `src/lib/economy/hiring.ts`**

```ts
import type { ItemDef, PriceMap, Taxes } from "./types";

export interface MaxWageResult {
  /** Margen bruto por unidad: precio - costo de insumos por unidad. */
  marginPerUnit: number;
  /** Salario máximo por punto de producción = margen neto de impuesto de mercado. */
  maxWage: number;
}

/** Salario máximo a pagar por punto de producción para que la empresa siga rentable. */
export function maxWagePerPoint(item: ItemDef, prices: PriceMap, taxes: Taxes): MaxWageResult {
  const price = prices[item.code] ?? 0;
  let inputCostPerUnit = 0;
  for (const [inputCode, qty] of Object.entries(item.productionNeeds)) {
    inputCostPerUnit += qty * (prices[inputCode] ?? 0);
  }
  const marginPerUnit = price - inputCostPerUnit;
  const maxWage = marginPerUnit * (1 - (taxes.market ?? 0) / 100);
  return { marginPerUnit, maxWage };
}
```

- [ ] **Step 4: Correr (pasan) + tsc**

Run: `npx vitest run src/lib/economy/hiring.test.ts` → PASS (2).
(tsc seguirá con errores en consumidores hasta Task 5.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/economy/hiring.ts src/lib/economy/hiring.test.ts
git commit -m "feat(economy): replace marginal hiringAnalysis with maxWagePerPoint"
```

---

### Task 5: Reescribir `assembleCompanyReport`

**Files:**
- Modify: `src/server/company-report.ts`, `src/server/company-report.test.ts`

- [ ] **Step 1: Reescribir el test**

Reemplazar TODO `src/server/company-report.test.ts` por:
```ts
import { describe, it, expect } from "vitest";
import { assembleCompanyReport } from "./company-report";
import type { ItemDef, PriceMap, Taxes } from "@/lib/economy";

const bread: ItemDef = { code: "bread", type: "product", productionPoints: 1, productionNeeds: { grain: 2 } };
const prices: PriceMap = { bread: 1.5, grain: 0.1 };
const taxes: Taxes = { income: 0, market: 10, selfWork: 0 };
const upgradesConfig = {
  automatedEngine: { levels: { "3": { stats: { dailyProd: 72 } } } },
  storage: { levels: { "1": { stats: { maxProduction: 200 } } } },
};
const company = {
  id: "c1",
  itemCode: "bread",
  production: 191, // stock
  workerCount: 0,
  upgrades: { automatedEngine: 3, breakRoom: 1, storage: 1 },
};

describe("assembleCompanyReport", () => {
  it("usa tasa de automatización (no el stock) y expone stock/almacén/maxWage", () => {
    const r = assembleCompanyReport({ company, item: bread, workers: [], prices, taxes, upgradesConfig });
    expect(r.dailyProductionRate).toBe(72); // automatedEngine L3, NO el stock 191
    expect(r.profit.revenue).toBeCloseTo(108); // 72*1.5
    expect(r.stock).toBe(191);
    expect(r.storageMax).toBe(200);
    expect(r.maxWageToHire).toBeCloseTo(1.17); // margen 1.3 - 10%
    expect(r.marginPerUnit).toBeCloseTo(1.3);
  });

  it("suma salarios de trabajadores como costo diario", () => {
    const r = assembleCompanyReport({ company, item: bread, workers: [{ wage: 2 }, { wage: 3 }], prices, taxes, upgradesConfig });
    expect(r.profit.wageCost).toBe(5);
  });
});
```

- [ ] **Step 2: Correr (debe fallar)**

Run: `npx vitest run src/server/company-report.test.ts` → FAIL.

- [ ] **Step 3: Reescribir `src/server/company-report.ts`**

```ts
import { companyProfit, maxWagePerPoint, automationDailyProd, storageMax } from "@/lib/economy";
import type { ItemDef, WorkerData, Taxes, PriceMap, ProfitBreakdown } from "@/lib/economy";
import type { UpgradesConfig } from "@/lib/economy";

export interface ReportCompany {
  id: string;
  itemCode: string;
  production: number; // stock actual
  workerCount: number;
  upgrades: { automatedEngine: number; breakRoom: number; storage: number };
}

export interface CompanyReport {
  id: string;
  itemCode: string;
  profit: ProfitBreakdown;
  /** Salario máximo por punto (margen neto de impuesto). */
  maxWageToHire: number;
  marginPerUnit: number;
  /** Stock actual en almacén. */
  stock: number;
  /** Tope del almacén. */
  storageMax: number;
  /** Tasa de producción diaria (automatización en 7A; + trabajadores en 7B). */
  dailyProductionRate: number;
}

/** Reporte económico de UNA empresa con el modelo de tasa diaria (puro). */
export function assembleCompanyReport(args: {
  company: ReportCompany;
  item: ItemDef;
  workers: WorkerData[];
  prices: PriceMap;
  taxes: Taxes;
  upgradesConfig: UpgradesConfig;
  /** Venta real/día (7B). Si falta, se asume vender todo lo producido. */
  sellPerDay?: number;
}): CompanyReport {
  const dailyProductionRate = automationDailyProd(args.upgradesConfig, args.company.upgrades.automatedEngine);
  const wageCostPerDay = args.workers.reduce((sum, w) => sum + w.wage, 0);

  const profit = companyProfit({
    dailyProductionRate,
    sellPerDay: args.sellPerDay,
    item: args.item,
    prices: args.prices,
    taxes: args.taxes,
    wageCostPerDay,
  });

  const mw = maxWagePerPoint(args.item, args.prices, args.taxes);

  return {
    id: args.company.id,
    itemCode: args.company.itemCode,
    profit,
    maxWageToHire: mw.maxWage,
    marginPerUnit: mw.marginPerUnit,
    stock: args.company.production,
    storageMax: storageMax(args.upgradesConfig, args.company.upgrades.storage),
    dailyProductionRate,
  };
}
```

- [ ] **Step 4: Correr (pasan) + tsc**

Run: `npx vitest run src/server/company-report.test.ts` → PASS (2).
(tsc aún con errores en portfolio/company-detail hasta Task 6.)

- [ ] **Step 5: Commit**

```bash
git add src/server/company-report.ts src/server/company-report.test.ts
git commit -m "feat(server): rewrite assembleCompanyReport with daily-rate model"
```

---

### Task 6: Actualizar `buildPortfolio` y `buildCompanyDetail`

**Files:**
- Modify: `src/server/portfolio.ts`, `src/server/portfolio.test.ts`, `src/server/company-detail.ts`, `src/server/company-detail.test.ts`

- [ ] **Step 1: Actualizar `portfolio.ts`**

En `src/server/portfolio.ts`:
1. Quitar el import de `GAME_CONSTANTS`/`GameConstants` y el campo `constants` de `BuildPortfolioOptions` (ya no afecta a `companyProfit`).
2. Construir el `company` para `assembleCompanyReport` con la forma `ReportCompany` (incluye `upgrades.storage`) y pasar `upgradesConfig: gameConfig.upgradesConfig`:
```ts
    const company = {
      id: c._id,
      itemCode: c.itemCode,
      production: c.production,
      workerCount: c.workerCount,
      upgrades: c.activeUpgradeLevels, // { automatedEngine, breakRoom, storage }
    };
    const report = assembleCompanyReport({ company, item, workers, prices, taxes, upgradesConfig: gameConfig.upgradesConfig });
    companies.push(report);
```
3. `estimated` del portfolio: `const estimated = companies.some((c) => c.profit.estimated);` (sin cambios).

- [ ] **Step 2: Actualizar `portfolio.test.ts`**

El cliente fake de `getGameConfig` debe incluir `upgradesConfig`. Reemplazar su `getGameConfig` y ajustar la empresa para que tenga automatización. Cambiar el fake y las aserciones del primer test:
```ts
    getCompanyById: async () => ({
      _id: "c1", itemCode: "bread", production: 50, workerCount: 2,
      activeUpgradeLevels: { automatedEngine: 3, breakRoom: 1, storage: 1 },
    }),
    getWorkers: async () => [{ wage: 1 }, { wage: 2 }],
    getPrices: async () => ({ bread: 1.5, grain: 0.1 }),
    getGameConfig: async () => ({
      items: { bread: { type: "product", productionPoints: 1, productionNeeds: { grain: 2 } } },
      upgradesConfig: { automatedEngine: { levels: { "3": { stats: { dailyProd: 72 } } } }, storage: { levels: { "1": { stats: { maxProduction: 200 } } } } },
    }),
```
Y en el primer test, reemplazar la aserción de beneficio por la nueva base (tasa 72, salarios 3):
```ts
    // tasa 72 ; ingresos 108 ; inputs 14.4 ; salarios 3 ; impuesto 10.8 ; neto 79.8
    expect(c.dailyProductionRate).toBe(72);
    expect(c.profit.netProfit).toBeCloseTo(79.8);
    expect(c.stock).toBe(50);
    expect(c.storageMax).toBe(200);
    expect(c.maxWageToHire).toBeCloseTo(c.marginPerUnit * 0.9);
    expect(r.totalNetProfit).toBeCloseTo(79.8);
    expect(r.wagesAvailable).toBe(true);
    expect(r.estimated).toBe(true);
```
(El test de "sin auth: no lee trabajadores" sigue válido: con `authenticated:false`, `workers=[]`, `wageCost 0`. Ajustar su aserción de `wageCost` si compara contra 0 — ya es 0.)
(El test de "con auth, si getWorkers falla" sigue válido.)

- [ ] **Step 3: Actualizar `company-detail.ts`**

En `src/server/company-detail.ts`:
1. Quitar `GAME_CONSTANTS`/`constants` (igual que portfolio).
2. Pasar `upgradesConfig: gameConfig.upgradesConfig` al `assembleCompanyReport` con el `company` en forma `ReportCompany` (con `storage`).
3. `CompanyDetail.upgrades` ya expone `{automatedEngine, breakRoom}`; añadir `storage` a ese objeto (viene de `c.activeUpgradeLevels.storage`).

```ts
  const report = assembleCompanyReport({ company, item, workers, prices, taxes, upgradesConfig: gameConfig.upgradesConfig });
  // ...
  upgrades: c.activeUpgradeLevels, // ahora { automatedEngine, breakRoom, storage }
```
Actualizar el tipo `CompanyDetail.upgrades` a `{ automatedEngine: number; breakRoom: number; storage: number }`.

- [ ] **Step 4: Actualizar `company-detail.test.ts`**

Añadir `upgradesConfig` al `getGameConfig` fake y `storage` al company fake; ajustar aserción:
```ts
    getCompanyById: async () => ({
      _id: "c1", itemCode: "bread", production: 10, workerCount: 2,
      activeUpgradeLevels: { automatedEngine: 3, breakRoom: 1, storage: 1 },
    }),
    getGameConfig: async () => ({
      items: { bread: { type: "product", productionPoints: 1, productionNeeds: { grain: 2 } } },
      upgradesConfig: { automatedEngine: { levels: { "3": { stats: { dailyProd: 72 } } } }, storage: { levels: { "1": { stats: { maxProduction: 200 } } } } },
    }),
```
En la primera aserción:
```ts
    expect(d.report.dailyProductionRate).toBe(72);
    expect(d.report.profit.revenue).toBeCloseTo(108);
    expect(d.upgrades.automatedEngine).toBe(3);
    expect(d.upgrades.storage).toBe(1);
```

- [ ] **Step 5: Correr suite + tsc**

Run: `npm test` → todo verde (portfolio, company-detail, y los que dependían de companyProfit/hiring).
Run: `./node_modules/.bin/tsc --noEmit` → exit 0.

Nota: el endpoint `/api/report` y `/api/company/[id]` pasaban `constants: getGameConstants()`. Como `BuildPortfolioOptions`/`BuildCompanyDetailOptions` ya no aceptan `constants`, QUITAR ese argumento de ambas rutas **y también el import `import { getGameConstants } from "@/server/get-constants"`** (queda sin usar). Sus tests usan `objectContaining` → siguen pasando. (El módulo `get-constants.ts` y su test quedan en el repo, sin consumidores, hasta que el Plan 7B reoriente la calibración — no se borra.)

- [ ] **Step 6: Commit**

```bash
git add src/server/portfolio.ts src/server/portfolio.test.ts src/server/company-detail.ts src/server/company-detail.test.ts src/app/api/report/route.ts "src/app/api/company/[id]/route.ts"
git commit -m "feat(server): wire daily-rate model into portfolio and detail"
```

---

### Task 7: UI — tasa correcta + stock/almacén

**Files:**
- Modify: `src/components/dashboard/company-card.tsx`, `src/components/dashboard/company-card.test.tsx`, `src/components/detail/breakdown.tsx`, `src/components/detail/breakdown.test.tsx`, `src/app/company/[id]/page.tsx`

- [ ] **Step 1: `company-card.tsx`** — usa el net corregido y muestra tasa/día

El componente ya usa `company.profit.netProfit`, `company.itemCode`, `company.maxWageToHire`. Reemplazar el bloque de `dl` (ingresos/salarios) por tasa diaria + ingresos, y quitar referencias a `company.hiring` (ya no existe). Reemplazar el cuerpo del `<Card>`:
```tsx
      <Card className="hover:shadow-lg hover:border-primary/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StatusDot color={status.color} label={LABEL[status.level]} />
            <span className="font-mono font-semibold">{company.itemCode}</span>
          </div>
          <Badge tone={status.color}>{LABEL[status.level]}</Badge>
        </div>
        <div className={`tabular mt-3 flex items-center gap-2 text-2xl font-bold ${positive ? "text-success" : "text-destructive"}`}>
          <Trend className="h-5 w-5" aria-hidden="true" />
          {formatPerDay(company.profit.netProfit)}
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <dt>Producción/día</dt>
          <dd className="tabular text-right text-foreground">{formatMoney(company.dailyProductionRate)}</dd>
          <dt>Stock</dt>
          <dd className="tabular text-right text-foreground">{formatMoney(company.stock)} / {formatMoney(company.storageMax)}</dd>
        </dl>
        {company.maxWageToHire > 0 ? (
          <div className="mt-3 flex items-center gap-1.5 text-xs text-accent">
            <UserPlus className="h-3.5 w-3.5" aria-hidden="true" /> Pagar hasta {formatMoney(company.maxWageToHire)} /punto
          </div>
        ) : null}
      </Card>
```

- [ ] **Step 2: `company-card.test.tsx`** — actualizar el fake `report()`

Reemplazar la función `report(net)` por la nueva forma de `CompanyReport`:
```tsx
function report(net: number): CompanyReport {
  return {
    id: "c1",
    itemCode: "bread",
    profit: { dailyProductionRate: 72, usefulRate: 72, revenue: 108, inputCost: 14.4, wageCost: 3, tax: 10.8, netProfit: net, sellAssumed: true, estimated: true },
    maxWageToHire: 1.17,
    marginPerUnit: 1.3,
    stock: 50,
    storageMax: 200,
    dailyProductionRate: 72,
  };
}
```
(Las aserciones existentes —itemCode "bread", `formatPerDay(net)`, estado— siguen válidas.)

- [ ] **Step 3: `breakdown.tsx`** — encabezar con producción/día

`Breakdown` recibe `profit: ProfitBreakdown`. Añadir una fila de "Producción/día" y "Vendible/día" arriba de Ingresos:
```tsx
      <Row label="Producción/día" value={formatMoney(profit.dailyProductionRate)} />
      <Row label="Vendible/día" value={formatMoney(profit.usefulRate)} />
      <Row label="Ingresos" value={formatMoney(profit.revenue)} />
      <Row label="Materiales" value={formatCost(profit.inputCost)} />
      <Row label="Salarios" value={formatCost(profit.wageCost)} />
      <Row label="Impuestos" value={formatCost(profit.tax)} />
      <div className="my-1 border-t border-border" />
      <Row label="Neto / día" value={formatPerDay(profit.netProfit)} strong />
```

- [ ] **Step 4: `breakdown.test.tsx`** — actualizar el `profit` del test

Reemplazar el objeto `profit` por la nueva forma:
```tsx
      <Breakdown
        profit={{ dailyProductionRate: 72, usefulRate: 72, revenue: 15, inputCost: 2, wageCost: 3, tax: 1.5, netProfit: 8.5, sellAssumed: true, estimated: true }}
      />,
```
(Las aserciones `getByText("Ingresos")` y `getByText("+8.50 /día")` siguen válidas.)

- [ ] **Step 5: `company/[id]/page.tsx`** — barra de stock/almacén

En la página de detalle, añadir (debajo del bloque del beneficio, antes del grid de Breakdown/Workers) una tarjeta de almacén usando `data.report.stock` y `data.report.storageMax`:
```tsx
              <Card className="cursor-default">
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Almacén</span>
                  <span className="tabular">{formatMoney(data.report.stock)} / {formatMoney(data.report.storageMax)}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${data.report.storageMax > 0 ? Math.min(100, (data.report.stock / data.report.storageMax) * 100) : 0}%` }}
                  />
                </div>
              </Card>
```
Asegurar que `formatMoney` esté importado en la página (ya importa `formatPerDay`; añadir `formatMoney`).

- [ ] **Step 6: Correr tests + tsc + build**

Run: `npm test` → todo verde.
Run: `./node_modules/.bin/tsc --noEmit` → exit 0.
Run: `npm run build` → compila.

- [ ] **Step 7: Commit**

```bash
git add src/components/dashboard/company-card.tsx src/components/dashboard/company-card.test.tsx src/components/detail/breakdown.tsx src/components/detail/breakdown.test.tsx "src/app/company/[id]/page.tsx"
git commit -m "feat(ui): show corrected daily rate and storage fill"
```

---

## Verificación final del Plan 7A

- [ ] `npm test` → todos verdes.
- [ ] `./node_modules/.bin/tsc --noEmit` → exit 0.
- [ ] `npm run build` → compila.
- [ ] Flujo en vivo (BebetoSan `6a141b049be11c48c9d30c50`):
  - Dashboard: las empresas muestran **producción/día** real (steel ≈ 72/día, no 191) y **stock / tope de almacén**.
  - El beneficio/día de steel pasa a basarse en 72/día × precio (no en el stock).
  - Detalle: barra de almacén (steel ≈ 191/200, casi lleno) y desglose con producción/día y vendible/día.
- [ ] Verificación visual con Playwright (dashboard + detalle) — confirmar tasa y barra de almacén.

## Notas para el Plan 7B

- Sumar **aporte de trabajadores** a `dailyProductionRate` (modelo laboral: producción×energía×fidelidad).
- **Venta real/día** (`sellPerDay`) desde transacciones (token) → `usefulRate = min(tasa, venta)`; quita el `sellAssumed`.
- **Recomendador de contratación** (panel en detalle): veredicto, salario máx por punto (ya está `maxWageToHire`), slots libres (`maxWorkers`), perfil sugerido, mercado laboral.
- **Parche de calibración:** reorientar a calibrar el throughput laboral (reusar store/endpoint/página).
