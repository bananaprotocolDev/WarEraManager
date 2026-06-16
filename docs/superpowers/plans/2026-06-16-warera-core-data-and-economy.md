# WarEra Company Manager — Plan 1: Núcleo de datos + motor económico

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el cliente tipado de la API de WarEra y el motor económico puro (beneficio/día, análisis de contratación, optimizador de producción, ROI de mejoras), con tests, entregando un script que calcula el beneficio real de un usuario.

**Architecture:** Proyecto Next.js + TypeScript. Dos capas independientes y testeables: `lib/warera` (cliente HTTP tipado con validación Zod, único punto de contacto con `api2.warera.io`) y `lib/economy` (funciones puras sin I/O que reciben datos + constantes y devuelven números). Las constantes no documentadas del juego se aíslan en `lib/game-constants`. Un script de verificación (`scripts/profit.ts`) une ambas capas contra datos reales.

**Tech Stack:** Next.js (App Router), TypeScript, Zod, Vitest, tsx (para correr scripts TS).

Spec de referencia: `docs/superpowers/specs/2026-06-16-warera-company-manager-design.md`

---

## Estructura de archivos (Plan 1)

- `package.json`, `tsconfig.json`, etc. — scaffold de Next.js (Task 1)
- `vitest.config.ts` — config de tests (Task 2)
- `src/lib/economy/types.ts` — tipos del dominio económico (Task 3)
- `src/lib/game-constants/index.ts` — constantes del juego aisladas/calibrables (Task 4)
- `src/lib/economy/profit.ts` — `companyProfit` (Task 5)
- `src/lib/economy/hiring.ts` — `hiringAnalysis` (Task 6)
- `src/lib/economy/optimizer.ts` — `productionOptimizer` (Task 7)
- `src/lib/economy/upgrade.ts` — `upgradeRoi` (Task 8)
- `src/lib/economy/index.ts` — barrel export (Task 9)
- `src/lib/warera/schemas.ts` — esquemas Zod de las respuestas (Task 10)
- `src/lib/warera/client.ts` — cliente tipado de la API (Task 11)
- `scripts/profit.ts` — script de verificación end-to-end (Task 12)

Tests junto a cada módulo: `*.test.ts`.

---

### Task 1: Scaffold del proyecto Next.js

**Files:**
- Create: estructura de Next.js en la raíz del repo.

- [ ] **Step 1: Crear el proyecto Next.js (no interactivo)**

El repo ya contiene `docs/` y `.git/` (create-next-app los ignora). Ejecutar en la raíz:

Run:
```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --yes
```
Expected: crea `package.json`, `tsconfig.json`, `src/app/`, `next.config.*`, `tailwind.config.*`. Si pregunta por sobrescribir algo, responder que no toque `docs/`.

- [ ] **Step 2: Verificar que arranca el typecheck**

Run: `npx tsc --noEmit`
Expected: termina sin errores (exit 0).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js + TypeScript project"
```

---

### Task 2: Configurar Vitest

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (script `test`)

- [ ] **Step 1: Instalar dependencias de test**

Run: `npm i -D vitest tsx`
Expected: se añaden a `devDependencies`.

- [ ] **Step 2: Crear `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 3: Añadir scripts a `package.json`**

En el objeto `"scripts"` agregar:
```json
"test": "vitest run",
"test:watch": "vitest",
"profit": "tsx scripts/profit.ts"
```

- [ ] **Step 4: Crear un test trivial para verificar la config**

Create `src/lib/economy/smoke.test.ts`:
```ts
import { describe, it, expect } from "vitest";

describe("vitest setup", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Correr los tests**

Run: `npm test`
Expected: PASS (1 test passed).

- [ ] **Step 6: Borrar el smoke test y commit**

```bash
rm src/lib/economy/smoke.test.ts
git add -A
git commit -m "test: configure vitest and tsx runner"
```

---

### Task 3: Tipos del dominio económico

**Files:**
- Create: `src/lib/economy/types.ts`

- [ ] **Step 1: Crear los tipos**

```ts
// Tipos del dominio económico. Sin dependencias de I/O.

/** Definición de un item del juego (de gameConfig.getGameConfig). */
export interface ItemDef {
  code: string;
  type: "raw" | "product" | "case" | "equipment" | "weapon";
  /** Puntos de producción para fabricar una unidad. */
  productionPoints: number;
  /** Insumos por unidad producida: { itemCode: cantidad }. */
  productionNeeds: Record<string, number>;
}

/** Datos de una empresa (de company.getById). */
export interface CompanyData {
  id: string;
  itemCode: string;
  /** Campo `production` crudo de la API. Se convierte a unidades/día vía constantes. */
  production: number;
  workerCount: number;
  upgrades: { automatedEngine: number; breakRoom: number };
}

/** Trabajador (de worker.getWorkers). */
export interface WorkerData {
  wage: number;
}

/** Impuestos del país (de country.getCountryById). Valores en porcentaje (ej. 1 = 1%). */
export interface Taxes {
  income: number;
  market: number;
  selfWork: number;
}

/** Mapa de precios de mercado: { itemCode: precio } (de itemTrading.getPrices). */
export type PriceMap = Record<string, number>;
```

- [ ] **Step 2: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/lib/economy/types.ts
git commit -m "feat(economy): add domain types"
```

---

### Task 4: Constantes del juego (aisladas y calibrables)

**Files:**
- Create: `src/lib/game-constants/index.ts`
- Test: `src/lib/game-constants/index.test.ts`

- [ ] **Step 1: Escribir el test**

```ts
import { describe, it, expect } from "vitest";
import { GAME_CONSTANTS, unitsPerDay, perWorkerUnitsPerDay } from "./index";

describe("game constants", () => {
  it("marca las constantes como no calibradas por defecto", () => {
    expect(GAME_CONSTANTS.calibrated).toBe(false);
  });

  it("convierte production a unidades/día con el factor", () => {
    const c = { ...GAME_CONSTANTS, productionToUnitsPerDay: 2 };
    expect(unitsPerDay(10, c)).toBe(20);
  });

  it("estima producción por trabajador como promedio cuando hay trabajadores", () => {
    // production=12, workerCount=3, factor=1 -> 12/3 = 4 unidades/día por trabajador
    expect(perWorkerUnitsPerDay(12, 3, GAME_CONSTANTS)).toBe(4);
  });

  it("usa el factor directo como producción marginal cuando no hay trabajadores", () => {
    // sin trabajadores, asume 1 punto de producción base * factor
    expect(perWorkerUnitsPerDay(0, 0, { ...GAME_CONSTANTS, productionToUnitsPerDay: 5 })).toBe(5);
  });
});
```

- [ ] **Step 2: Correr el test (debe fallar)**

Run: `npx vitest run src/lib/game-constants/index.test.ts`
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementar**

```ts
/**
 * Constantes del juego WarEra que NO están documentadas oficialmente.
 * Aisladas acá para poder calibrarlas contra datos reales (ver spec §4).
 * Mientras `calibrated` sea false, los cálculos deben marcarse como "estimados".
 */
export interface GameConstants {
  /** Factor para convertir el campo `production` de una empresa en unidades/día. */
  productionToUnitsPerDay: number;
  /** Si las constantes fueron validadas contra datos reales del usuario. */
  calibrated: boolean;
}

export const GAME_CONSTANTS: GameConstants = {
  // PLACEHOLDER estimado: 1:1 hasta calibrar contra transacciones reales.
  productionToUnitsPerDay: 1,
  calibrated: false,
};

/** Unidades producidas por día a partir del campo `production` crudo. */
export function unitsPerDay(production: number, c: GameConstants = GAME_CONSTANTS): number {
  return production * c.productionToUnitsPerDay;
}

/**
 * Estimación de unidades/día que aporta un trabajador.
 * Si hay trabajadores, usa el promedio (production/workerCount).
 * Si no hay, asume una unidad base de producción por el factor.
 */
export function perWorkerUnitsPerDay(
  production: number,
  workerCount: number,
  c: GameConstants = GAME_CONSTANTS,
): number {
  if (workerCount > 0) return (production / workerCount) * c.productionToUnitsPerDay;
  return c.productionToUnitsPerDay;
}
```

- [ ] **Step 4: Correr el test (debe pasar)**

Run: `npx vitest run src/lib/game-constants/index.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/game-constants/
git commit -m "feat(game-constants): add isolated calibratable game constants"
```

---

### Task 5: `companyProfit` — beneficio/día por empresa

**Files:**
- Create: `src/lib/economy/profit.ts`
- Test: `src/lib/economy/profit.test.ts`

- [ ] **Step 1: Escribir el test**

```ts
import { describe, it, expect } from "vitest";
import { companyProfit } from "./profit";
import type { ItemDef, CompanyData, Taxes, PriceMap } from "./types";
import { GAME_CONSTANTS } from "../game-constants";

const bread: ItemDef = {
  code: "bread",
  type: "product",
  productionPoints: 1,
  productionNeeds: { grain: 2 }, // 2 de grano por unidad de pan
};

const company: CompanyData = {
  id: "c1",
  itemCode: "bread",
  production: 10, // factor 1 -> 10 unidades/día
  workerCount: 2,
  upgrades: { automatedEngine: 0, breakRoom: 0 },
};

const prices: PriceMap = { bread: 1.5, grain: 0.1 };
const taxes: Taxes = { income: 0, market: 10, selfWork: 0 }; // 10% market tax

describe("companyProfit", () => {
  it("calcula el desglose de beneficio neto/día", () => {
    const r = companyProfit({
      company,
      item: bread,
      workers: [{ wage: 1 }, { wage: 2 }],
      prices,
      taxes,
      constants: GAME_CONSTANTS,
    });
    // unidades/día = 10
    expect(r.unitsPerDay).toBe(10);
    // ingresos = 10 * 1.5 = 15
    expect(r.revenue).toBeCloseTo(15);
    // inputs = 10 unidades * 2 grano * 0.1 = 2
    expect(r.inputCost).toBeCloseTo(2);
    // salarios = 1 + 2 = 3
    expect(r.wageCost).toBe(3);
    // impuesto = 15 * 0.10 = 1.5
    expect(r.tax).toBeCloseTo(1.5);
    // neto = 15 - 2 - 3 - 1.5 = 8.5
    expect(r.netProfit).toBeCloseTo(8.5);
    // estimado porque las constantes no están calibradas
    expect(r.estimated).toBe(true);
  });

  it("usa precio 0 cuando un item no está en el mapa de precios", () => {
    const r = companyProfit({
      company,
      item: bread,
      workers: [],
      prices: {}, // sin precios
      taxes: { income: 0, market: 0, selfWork: 0 },
      constants: GAME_CONSTANTS,
    });
    expect(r.revenue).toBe(0);
    expect(r.inputCost).toBe(0);
    expect(r.netProfit).toBe(0);
  });
});
```

- [ ] **Step 2: Correr el test (debe fallar)**

Run: `npx vitest run src/lib/economy/profit.test.ts`
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementar**

```ts
import type { ItemDef, CompanyData, WorkerData, Taxes, PriceMap } from "./types";
import { GameConstants, GAME_CONSTANTS, unitsPerDay } from "../game-constants";

export interface ProfitBreakdown {
  unitsPerDay: number;
  revenue: number;
  inputCost: number;
  wageCost: number;
  tax: number;
  netProfit: number;
  /** true si las constantes del juego no están calibradas (cifra estimada). */
  estimated: boolean;
}

export function companyProfit(args: {
  company: CompanyData;
  item: ItemDef;
  workers: WorkerData[];
  prices: PriceMap;
  taxes: Taxes;
  constants?: GameConstants;
}): ProfitBreakdown {
  const constants = args.constants ?? GAME_CONSTANTS;
  const units = unitsPerDay(args.company.production, constants);

  const price = args.prices[args.item.code] ?? 0;
  const revenue = units * price;

  let inputCost = 0;
  for (const [inputCode, qtyPerUnit] of Object.entries(args.item.productionNeeds)) {
    const inputPrice = args.prices[inputCode] ?? 0;
    inputCost += qtyPerUnit * units * inputPrice;
  }

  const wageCost = args.workers.reduce((sum, w) => sum + w.wage, 0);
  const tax = revenue * ((args.taxes.market ?? 0) / 100);
  const netProfit = revenue - inputCost - wageCost - tax;

  return {
    unitsPerDay: units,
    revenue,
    inputCost,
    wageCost,
    tax,
    netProfit,
    estimated: !constants.calibrated,
  };
}
```

- [ ] **Step 4: Correr el test (debe pasar)**

Run: `npx vitest run src/lib/economy/profit.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/economy/profit.ts src/lib/economy/profit.test.ts
git commit -m "feat(economy): add companyProfit calculation"
```

---

### Task 6: `hiringAnalysis` — ¿conviene contratar?

**Files:**
- Create: `src/lib/economy/hiring.ts`
- Test: `src/lib/economy/hiring.test.ts`

- [ ] **Step 1: Escribir el test**

```ts
import { describe, it, expect } from "vitest";
import { hiringAnalysis } from "./hiring";
import type { ItemDef, CompanyData, Taxes, PriceMap } from "./types";
import { GAME_CONSTANTS } from "../game-constants";

const bread: ItemDef = {
  code: "bread",
  type: "product",
  productionPoints: 1,
  productionNeeds: { grain: 2 },
};
const company: CompanyData = {
  id: "c1",
  itemCode: "bread",
  production: 12,
  workerCount: 3, // -> 4 unidades/día por trabajador marginal
  upgrades: { automatedEngine: 0, breakRoom: 0 },
};
const prices: PriceMap = { bread: 1.5, grain: 0.1 };
const taxes: Taxes = { income: 0, market: 0, selfWork: 0 };

describe("hiringAnalysis", () => {
  it("recomienda contratar si el valor marginal supera el salario pedido", () => {
    const r = hiringAnalysis({ company, item: bread, prices, taxes, candidateWage: 3, constants: GAME_CONSTANTS });
    // unidades marginales = 12/3 = 4
    expect(r.marginalUnitsPerDay).toBe(4);
    // valor marginal = 4*1.5 - (4*2*0.1) = 6 - 0.8 = 5.2
    expect(r.marginalValue).toBeCloseTo(5.2);
    expect(r.maxWage).toBeCloseTo(5.2);
    expect(r.worthIt).toBe(true);
  });

  it("no recomienda contratar si el salario supera el valor marginal", () => {
    const r = hiringAnalysis({ company, item: bread, prices, taxes, candidateWage: 6, constants: GAME_CONSTANTS });
    expect(r.worthIt).toBe(false);
  });
});
```

- [ ] **Step 2: Correr el test (debe fallar)**

Run: `npx vitest run src/lib/economy/hiring.test.ts`
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementar**

```ts
import type { ItemDef, CompanyData, Taxes, PriceMap } from "./types";
import { GameConstants, GAME_CONSTANTS, perWorkerUnitsPerDay } from "../game-constants";

export interface HiringResult {
  marginalUnitsPerDay: number;
  /** Valor neto/día que aporta un trabajador extra (ingresos extra - inputs extra - impuesto extra). */
  marginalValue: number;
  /** Salario máximo a pagar para que siga conviniendo. */
  maxWage: number;
  worthIt: boolean;
  estimated: boolean;
}

export function hiringAnalysis(args: {
  company: CompanyData;
  item: ItemDef;
  prices: PriceMap;
  taxes: Taxes;
  candidateWage: number;
  constants?: GameConstants;
}): HiringResult {
  const constants = args.constants ?? GAME_CONSTANTS;
  const marginalUnits = perWorkerUnitsPerDay(args.company.production, args.company.workerCount, constants);

  const price = args.prices[args.item.code] ?? 0;
  const marginalRevenue = marginalUnits * price;

  let marginalInputCost = 0;
  for (const [inputCode, qtyPerUnit] of Object.entries(args.item.productionNeeds)) {
    marginalInputCost += qtyPerUnit * marginalUnits * (args.prices[inputCode] ?? 0);
  }

  const marginalTax = marginalRevenue * ((args.taxes.market ?? 0) / 100);
  const marginalValue = marginalRevenue - marginalInputCost - marginalTax;

  return {
    marginalUnitsPerDay: marginalUnits,
    marginalValue,
    maxWage: marginalValue,
    worthIt: args.candidateWage < marginalValue,
    estimated: !constants.calibrated,
  };
}
```

- [ ] **Step 4: Correr el test (debe pasar)**

Run: `npx vitest run src/lib/economy/hiring.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/economy/hiring.ts src/lib/economy/hiring.test.ts
git commit -m "feat(economy): add hiringAnalysis"
```

---

### Task 7: `productionOptimizer` — mejor qué producir

**Files:**
- Create: `src/lib/economy/optimizer.ts`
- Test: `src/lib/economy/optimizer.test.ts`

- [ ] **Step 1: Escribir el test**

```ts
import { describe, it, expect } from "vitest";
import { productionOptimizer } from "./optimizer";
import type { ItemDef, PriceMap } from "./types";

const items: ItemDef[] = [
  { code: "bread", type: "product", productionPoints: 1, productionNeeds: { grain: 2 } },
  { code: "steel", type: "product", productionPoints: 2, productionNeeds: { limestone: 1 } },
  { code: "rifle", type: "equipment", productionPoints: 5, productionNeeds: {} },
];
const prices: PriceMap = { bread: 1.5, grain: 0.1, steel: 1.6, limestone: 0.08, rifle: 10 };

describe("productionOptimizer", () => {
  it("rankea items por margen por punto de producción, descendente", () => {
    const r = productionOptimizer({ items, prices });
    // bread: (1.5 - 2*0.1)/1 = 1.3
    // steel: (1.6 - 1*0.08)/2 = 0.76
    // rifle no es product/raw -> excluido
    expect(r.map((o) => o.itemCode)).toEqual(["bread", "steel"]);
    expect(r[0].marginPerPoint).toBeCloseTo(1.3);
    expect(r[1].marginPerPoint).toBeCloseTo(0.76);
  });

  it("excluye items sin precio de venta", () => {
    const r = productionOptimizer({ items, prices: { grain: 0.1, limestone: 0.08 } });
    expect(r).toEqual([]);
  });
});
```

- [ ] **Step 2: Correr el test (debe fallar)**

Run: `npx vitest run src/lib/economy/optimizer.test.ts`
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementar**

```ts
import type { ItemDef, PriceMap } from "./types";

export interface ProductionOption {
  itemCode: string;
  /** Margen neto por punto de producción: (precio - costo insumos por unidad) / productionPoints. */
  marginPerPoint: number;
}

export function productionOptimizer(args: { items: ItemDef[]; prices: PriceMap }): ProductionOption[] {
  const options: ProductionOption[] = [];

  for (const item of args.items) {
    if (item.type !== "product" && item.type !== "raw") continue;
    const sellPrice = args.prices[item.code];
    if (sellPrice === undefined) continue;

    let inputCostPerUnit = 0;
    for (const [inputCode, qty] of Object.entries(item.productionNeeds)) {
      inputCostPerUnit += qty * (args.prices[inputCode] ?? 0);
    }

    const points = item.productionPoints > 0 ? item.productionPoints : 1;
    options.push({ itemCode: item.code, marginPerPoint: (sellPrice - inputCostPerUnit) / points });
  }

  return options.sort((a, b) => b.marginPerPoint - a.marginPerPoint);
}
```

- [ ] **Step 4: Correr el test (debe pasar)**

Run: `npx vitest run src/lib/economy/optimizer.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/economy/optimizer.ts src/lib/economy/optimizer.test.ts
git commit -m "feat(economy): add productionOptimizer"
```

---

### Task 8: `upgradeRoi` — ROI de mejoras

**Files:**
- Create: `src/lib/economy/upgrade.ts`
- Test: `src/lib/economy/upgrade.test.ts`

- [ ] **Step 1: Escribir el test**

```ts
import { describe, it, expect } from "vitest";
import { upgradeRoi } from "./upgrade";

describe("upgradeRoi", () => {
  it("calcula días de repago = costo / ganancia extra por día", () => {
    const r = upgradeRoi({ upgradeCost: 100, profitDeltaPerDay: 25 });
    expect(r.paybackDays).toBe(4);
    expect(r.worthIt).toBe(true);
  });

  it("devuelve Infinity y worthIt=false si la mejora no aumenta la ganancia", () => {
    const r = upgradeRoi({ upgradeCost: 100, profitDeltaPerDay: 0 });
    expect(r.paybackDays).toBe(Infinity);
    expect(r.worthIt).toBe(false);
  });
});
```

- [ ] **Step 2: Correr el test (debe fallar)**

Run: `npx vitest run src/lib/economy/upgrade.test.ts`
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementar**

```ts
export interface UpgradeRoiResult {
  paybackDays: number;
  worthIt: boolean;
}

/**
 * ROI de una mejora: días para recuperar el costo con la ganancia extra diaria.
 * @param maxPaybackDays umbral para considerar la mejora rentable (default 30 días).
 */
export function upgradeRoi(args: {
  upgradeCost: number;
  profitDeltaPerDay: number;
  maxPaybackDays?: number;
}): UpgradeRoiResult {
  const threshold = args.maxPaybackDays ?? 30;
  if (args.profitDeltaPerDay <= 0) {
    return { paybackDays: Infinity, worthIt: false };
  }
  const paybackDays = args.upgradeCost / args.profitDeltaPerDay;
  return { paybackDays, worthIt: paybackDays <= threshold };
}
```

- [ ] **Step 4: Correr el test (debe pasar)**

Run: `npx vitest run src/lib/economy/upgrade.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/economy/upgrade.ts src/lib/economy/upgrade.test.ts
git commit -m "feat(economy): add upgradeRoi"
```

---

### Task 9: Barrel export del motor económico

**Files:**
- Create: `src/lib/economy/index.ts`

- [ ] **Step 1: Crear el barrel**

```ts
export * from "./types";
export * from "./profit";
export * from "./hiring";
export * from "./optimizer";
export * from "./upgrade";
```

- [ ] **Step 2: Verificar typecheck y tests**

Run: `npx tsc --noEmit && npm test`
Expected: exit 0; todos los tests del motor pasan.

- [ ] **Step 3: Commit**

```bash
git add src/lib/economy/index.ts
git commit -m "feat(economy): add barrel export"
```

---

### Task 10: Esquemas Zod de la API

**Files:**
- Create: `src/lib/warera/schemas.ts`
- Test: `src/lib/warera/schemas.test.ts`

- [ ] **Step 1: Instalar Zod**

Run: `npm i zod`
Expected: añadido a `dependencies`.

- [ ] **Step 2: Escribir el test**

Usa fragmentos reales observados de la API (ver spec §2).

```ts
import { describe, it, expect } from "vitest";
import { trpcEnvelope, pricesSchema, companySchema } from "./schemas";

describe("warera schemas", () => {
  it("desenvuelve la forma tRPC { result: { data } }", () => {
    const parsed = trpcEnvelope(pricesSchema).parse({
      result: { data: { grain: 0.075, bread: 1.77 } },
    });
    expect(parsed.grain).toBeCloseTo(0.075);
  });

  it("parsea una empresa tolerando campos extra", () => {
    const c = companySchema.parse({
      _id: "c1",
      itemCode: "bread",
      production: 10,
      workerCount: 2,
      activeUpgradeLevels: { automatedEngine: 1, breakRoom: 0 },
      extra: "ignorado",
    });
    expect(c.itemCode).toBe("bread");
    expect(c.activeUpgradeLevels.automatedEngine).toBe(1);
  });

  it("aplica default 0 a upgrades faltantes", () => {
    const c = companySchema.parse({
      _id: "c2",
      itemCode: "steel",
      production: 5,
      workerCount: 0,
      activeUpgradeLevels: { automatedEngine: 2 },
    });
    expect(c.activeUpgradeLevels.breakRoom).toBe(0);
  });
});
```

- [ ] **Step 3: Correr el test (debe fallar)**

Run: `npx vitest run src/lib/warera/schemas.test.ts`
Expected: FAIL (módulo no existe).

- [ ] **Step 4: Implementar**

```ts
import { z } from "zod";

/** Envoltorio tRPC: la data útil vive en result.data. */
export function trpcEnvelope<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({ result: z.object({ data: dataSchema }) }).transform((v) => v.result.data);
}

/** itemTrading.getPrices -> { itemCode: precio }. */
export const pricesSchema = z.record(z.string(), z.number());

/** company.getById. Tolerante a campos extra; normaliza upgrades. */
export const companySchema = z
  .object({
    _id: z.string(),
    itemCode: z.string(),
    production: z.number().default(0),
    workerCount: z.number().default(0),
    activeUpgradeLevels: z
      .object({
        automatedEngine: z.number().default(0),
        breakRoom: z.number().default(0),
      })
      .partial()
      .transform((u) => ({
        automatedEngine: u.automatedEngine ?? 0,
        breakRoom: u.breakRoom ?? 0,
      }))
      .default({}),
  })
  .passthrough();

/** company.getCompanies -> lista paginada de ids. */
export const companyListSchema = z.object({
  items: z.array(z.string()),
  nextCursor: z.string().nullable().optional(),
});

/** worker.getWorkers -> lista de trabajadores con salario. */
export const workersSchema = z.array(z.object({ wage: z.number() }).passthrough());

/** country.getCountryById -> impuestos. */
export const countrySchema = z
  .object({
    taxes: z
      .object({
        income: z.number().default(0),
        market: z.number().default(0),
        selfWork: z.number().default(0),
      })
      .partial()
      .transform((t) => ({
        income: t.income ?? 0,
        market: t.market ?? 0,
        selfWork: t.selfWork ?? 0,
      }))
      .default({}),
  })
  .passthrough();
```

- [ ] **Step 5: Correr el test (debe pasar)**

Run: `npx vitest run src/lib/warera/schemas.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/warera/
git commit -m "feat(warera): add Zod schemas for API responses"
```

---

### Task 11: Cliente tipado de la API

**Files:**
- Create: `src/lib/warera/client.ts`
- Test: `src/lib/warera/client.test.ts`

- [ ] **Step 1: Escribir el test (con fetch mockeado)**

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { WareraClient } from "./client";

function mockFetchOnce(data: unknown) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(JSON.stringify({ result: { data } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
}

afterEach(() => vi.restoreAllMocks());

describe("WareraClient", () => {
  it("construye la URL tRPC con input codificado y desenvuelve la data", async () => {
    const spy = mockFetchOnce({ grain: 0.075 });
    const client = new WareraClient();
    const prices = await client.getPrices();
    expect(prices.grain).toBeCloseTo(0.075);

    const calledUrl = spy.mock.calls[0][0] as string;
    expect(calledUrl).toContain("/trpc/itemTrading.getPrices");
  });

  it("envía el input como parámetro JSON url-encoded", async () => {
    const spy = mockFetchOnce({
      _id: "c1",
      itemCode: "bread",
      production: 10,
      workerCount: 2,
      activeUpgradeLevels: { automatedEngine: 0, breakRoom: 0 },
    });
    const client = new WareraClient();
    await client.getCompanyById("c1");
    const calledUrl = spy.mock.calls[0][0] as string;
    expect(calledUrl).toContain("company.getById");
    expect(calledUrl).toContain(encodeURIComponent(JSON.stringify({ companyId: "c1" })));
  });

  it("lanza error si el HTTP status no es ok", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("nope", { status: 500 }));
    const client = new WareraClient();
    await expect(client.getPrices()).rejects.toThrow(/500/);
  });
});
```

- [ ] **Step 2: Correr el test (debe fallar)**

Run: `npx vitest run src/lib/warera/client.test.ts`
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementar**

```ts
import { z } from "zod";
import {
  trpcEnvelope,
  pricesSchema,
  companySchema,
  companyListSchema,
  workersSchema,
  countrySchema,
} from "./schemas";

const DEFAULT_BASE = "https://api2.warera.io/trpc";
const ORIGIN = "https://app.warera.io";

export class WareraClient {
  constructor(private baseUrl: string = DEFAULT_BASE) {}

  /** Llama un procedimiento tRPC por GET y valida la respuesta. */
  private async call<T extends z.ZodTypeAny>(
    proc: string,
    dataSchema: T,
    input?: unknown,
  ): Promise<z.infer<T>> {
    let url = `${this.baseUrl}/${proc}`;
    if (input !== undefined) {
      url += `?input=${encodeURIComponent(JSON.stringify(input))}`;
    }
    const res = await fetch(url, {
      headers: { Origin: ORIGIN, "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) {
      throw new Error(`WarEra API ${proc} failed: HTTP ${res.status}`);
    }
    const json = await res.json();
    return trpcEnvelope(dataSchema).parse(json);
  }

  getPrices() {
    return this.call("itemTrading.getPrices", pricesSchema);
  }

  getCompanyById(companyId: string) {
    return this.call("company.getById", companySchema, { companyId });
  }

  getUserCompanies(userId: string, perPage = 15) {
    return this.call("company.getCompanies", companyListSchema, { userId, perPage });
  }

  getWorkers(companyId: string) {
    return this.call("worker.getWorkers", workersSchema, { companyId });
  }

  getCountryById(countryId: string) {
    return this.call("country.getCountryById", countrySchema, { countryId });
  }
}
```

- [ ] **Step 4: Correr el test (debe pasar)**

Run: `npx vitest run src/lib/warera/client.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/warera/client.ts src/lib/warera/client.test.ts
git commit -m "feat(warera): add typed API client"
```

---

### Task 12: Script de verificación end-to-end

**Files:**
- Create: `scripts/profit.ts`

- [ ] **Step 1: Implementar el script**

Une cliente + motor contra datos reales. Recibe un `userId` por argumento.

```ts
/**
 * Verificación end-to-end: calcula el beneficio/día de las empresas de un usuario.
 * Uso: npm run profit -- <userId> <countryId>
 *
 * NOTA: las cifras son ESTIMADAS hasta calibrar game-constants (ver spec §4).
 * gameConfig.getGameConfig se consulta crudo acá; su parseo tipado llega en el Plan 2.
 */
import { WareraClient } from "../src/lib/warera/client";
import { companyProfit } from "../src/lib/economy";
import type { ItemDef } from "../src/lib/economy";

async function main() {
  const [userId, countryId] = process.argv.slice(2);
  if (!userId) {
    console.error("Uso: npm run profit -- <userId> [countryId]");
    process.exit(1);
  }

  const client = new WareraClient();
  const prices = await client.getPrices();

  // gameConfig crudo: extraemos el mapa de items -> { productionPoints, productionNeeds, type }
  const gcRes = await fetch("https://api2.warera.io/trpc/gameConfig.getGameConfig", {
    headers: { Origin: "https://app.warera.io", "User-Agent": "Mozilla/5.0" },
  });
  const gc = (await gcRes.json())?.result?.data ?? {};
  const itemsRaw: Record<string, any> = gc.items ?? {};
  const itemDef = (code: string): ItemDef => {
    const r = itemsRaw[code] ?? {};
    return {
      code,
      type: r.type ?? "product",
      productionPoints: r.productionPoints ?? 1,
      productionNeeds: r.productionNeeds ?? {},
    };
  };

  const taxes = countryId
    ? (await client.getCountryById(countryId)).taxes
    : { income: 0, market: 0, selfWork: 0 };

  const list = await client.getUserCompanies(userId);
  console.log(`\nEmpresas de ${userId}: ${list.items.length}\n`);

  let total = 0;
  for (const companyId of list.items) {
    const c = await client.getCompanyById(companyId);
    const workers = await client.getWorkers(companyId);
    const item = itemDef(c.itemCode);
    const p = companyProfit({
      company: {
        id: c._id,
        itemCode: c.itemCode,
        production: c.production,
        workerCount: c.workerCount,
        upgrades: c.activeUpgradeLevels,
      },
      item,
      workers,
      prices,
      taxes,
    });
    total += p.netProfit;
    console.log(
      `${c.itemCode.padEnd(12)} neto/día=${p.netProfit.toFixed(2)}  ` +
        `(ingresos=${p.revenue.toFixed(2)} inputs=${p.inputCost.toFixed(2)} ` +
        `salarios=${p.wageCost.toFixed(2)} imp=${p.tax.toFixed(2)})`,
    );
  }
  console.log(`\nTOTAL neto/día estimado: ${total.toFixed(2)}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Correr typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Probar contra datos reales**

Conseguir tu `userId` (resolviendo tu username vía `user.getUsersByCountry` o desde la URL de tu perfil en la web). Luego:

Run: `npm run profit -- <tuUserId> <tuCountryId>`
Expected: imprime una línea por empresa con el desglose y el total neto/día. (Las cifras son estimadas hasta calibrar.)

- [ ] **Step 4: Commit**

```bash
git add scripts/profit.ts
git commit -m "feat: add end-to-end profit verification script"
```

---

## Verificación final del Plan 1

- [ ] `npm test` → todos los tests pasan (game-constants, profit, hiring, optimizer, upgrade, schemas, client).
- [ ] `npx tsc --noEmit` → sin errores.
- [ ] `npm run profit -- <userId> <countryId>` → imprime beneficio/día real por empresa.

## Notas para los planes siguientes

- **Calibración (Plan 2/3):** comparar `netProfit` estimado contra `transaction.getPaginatedTransactions`
  reales para ajustar `productionToUnitsPerDay` y poner `calibrated: true`.
- **Plan 2 (backend web):** mover el fetch crudo de `gameConfig` a un método tipado del cliente
  (`getGameConfig` + schema), añadir proxy con allow-list, caché compartida y API routes.
- **Plan 3:** histórico de precios (DB + cron). **Plan 4:** las 5 pantallas UI.
