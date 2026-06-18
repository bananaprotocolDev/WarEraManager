# WarEra Company Manager — Plan 7C: Aporte de trabajadores + parche de calibración

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sumar el aporte real de los trabajadores a la producción diaria (skills de producción/energía + fidelidad) y reorientar la calibración a un **factor de tasa** (venta real ÷ tasa modelada) que corrige el modelo contra tus datos.

**Architecture:** Cada trabajador (`worker.getWorkers`: `{user, wage, fidelity}`, auth-gated) aporta `workerUnitsPerDay` usando sus skills `production.value`/`energy.value` de `getUserLite` (público) y su fidelidad. Un helper server suma ese aporte. `assembleCompanyReport` pasa a `tasaDiaria = (automationDailyProd + aporteTrabajadores) × rateFactor`. La calibración se reescribe: `rateFactor = Σ ventaReal/día ÷ Σ tasaModelada` (automatización + trabajadores), persistido en el `CalibrationStore` existente y aplicado en los reportes. Para empresas sin trabajadores valida la automatización (factor≈1).

**Tech Stack:** Next.js 16, TypeScript, Zod, Vitest.

Spec: `docs/superpowers/specs/2026-06-18-production-model-and-hiring-design.md` (§5, §7). Tras 7C: Plan 6B (precio actual + tendencia).

---

## Decisiones de alcance (7C)

- **Skills directos:** `getUserLite().skills.production.value` y `.energy.value` (verificado: producción 25 a nivel 5, energía 80 a nivel 5; `energy.hourlyBarRegen` coincide con el modelo laboral). No hace falta convertir de nivel.
- **Aporte de trabajadores:** se calcula en `buildPortfolio` y `buildCompanyDetail` cuando hay token (workers son auth-gated; los skills son públicos). Sin token: aporte 0 (tasa = automatización), como hoy.
- **Calibración = factor de tasa.** Reusa `CalibrationStore` (campo `factor`), endpoint `/api/calibrate` y página `/calibrate`; cambia QUÉ calcula: `factor = Σ realizadas/día ÷ Σ modeladas/día`. El loader `getRateFactor()` reemplaza el uso de `getGameConstants`/`gameConstantsFrom` (de 6A, ya sin consumidores). Se aplica el factor a la tasa en los reportes.
- **`get-constants.ts` (6A)** se reemplaza por `calibration-factor.ts` (loader de `rateFactor`). Su test se reescribe.

## Estructura de archivos

- `src/lib/economy/labor.ts` (+test) — `energyValueForLevel` (helper menor, completitud) (Task 1)
- `src/lib/warera/schemas.ts`, `src/lib/warera/schemas.test.ts` — `workersSchema` (user/fidelity), `userLiteSchema` (skills) (Task 1)
- `src/server/worker-output.ts` (+test) — `companyWorkerOutput` (Task 2)
- `src/server/calibration-factor.ts` (+test) — `getRateFactor`; borrar `get-constants.ts`(+test) (Task 3)
- `src/server/calibrate.ts` (+test) — reescritura a factor de tasa (Task 3)
- `src/server/company-report.ts` (+test) — `workerDailyOutput` + `rateFactor` en la tasa (Task 4)
- `src/server/portfolio.ts`, `src/server/company-detail.ts` (+tests) — wiring (Task 4)
- `src/app/calibrate/page.tsx`, `src/components/detail/breakdown.tsx` (+test) — textos/labels (Task 5)

**Entorno:** typecheck `./node_modules/.bin/tsc --noEmit`. Tests `npm test`. Build `npm run build`.

---

### Task 1: Schemas de trabajador/skills + helper de energía

**Files:**
- Modify: `src/lib/economy/labor.ts`, `src/lib/economy/labor.test.ts`, `src/lib/warera/schemas.ts`, `src/lib/warera/schemas.test.ts`

- [ ] **Step 1: Test del helper de energía + schemas**

Añadir a `src/lib/economy/labor.test.ts`:
```ts
import { energyValueForLevel } from "./labor";

describe("energyValueForLevel", () => {
  it("30 base, +10 por nivel", () => {
    expect(energyValueForLevel(0)).toBe(30);
    expect(energyValueForLevel(5)).toBe(80);
  });
});
```
Añadir a `src/lib/warera/schemas.test.ts`:
```ts
import { workersSchema as wSchema2, userLiteSchema as ulSchema2 } from "./schemas";

describe("workers + userLite skills", () => {
  it("workersSchema trae user, wage y fidelity (default 0)", () => {
    const w = wSchema2.parse([{ user: "u1", wage: 0.5, fidelity: 3 }, { user: "u2", wage: 1 }]);
    expect(w[0]).toMatchObject({ user: "u1", wage: 0.5, fidelity: 3 });
    expect(w[1].fidelity).toBe(0);
  });
  it("userLiteSchema parsea skills.production.value y energy.value", () => {
    const u = ulSchema2.parse({ _id: "u1", username: "x", skills: { production: { value: 25 }, energy: { value: 80 } } });
    expect(u.skills.production.value).toBe(25);
    expect(u.skills.energy.value).toBe(80);
  });
  it("userLiteSchema tolera skills ausentes (valores 0)", () => {
    const u = ulSchema2.parse({ _id: "u2", username: "y" });
    expect(u.skills.production.value).toBe(0);
    expect(u.skills.energy.value).toBe(0);
  });
});
```

- [ ] **Step 2: Correr (deben fallar)**

Run: `npx vitest run src/lib/economy/labor.test.ts src/lib/warera/schemas.test.ts` → FAIL.

- [ ] **Step 3: Implementar el helper**

Añadir a `src/lib/economy/labor.ts`:
```ts
/** Valor del skill de energía para un nivel (30 base, +10 por nivel). */
export function energyValueForLevel(level: number): number {
  return 30 + 10 * level;
}
```

- [ ] **Step 4: Implementar los schemas**

En `src/lib/warera/schemas.ts`, reemplazar `workersSchema` por:
```ts
export const workersSchema = z.array(
  z
    .object({
      user: z.string().optional(),
      wage: z.number(),
      fidelity: z.number().default(0),
    })
    .passthrough(),
);
```
Y reemplazar `userLiteSchema` por (añadiendo skills tolerantes):
```ts
const skillValueSchema = z
  .object({ value: z.number().default(0) })
  .partial()
  .transform((s) => ({ value: s.value ?? 0 }))
  .default({ value: 0 });

export const userLiteSchema = z
  .object({
    _id: z.string(),
    username: z.string(),
    country: z.string().optional(),
    skills: z
      .object({ production: skillValueSchema, energy: skillValueSchema })
      .partial()
      .transform((s) => ({
        production: s.production ?? { value: 0 },
        energy: s.energy ?? { value: 0 },
      }))
      .default({ production: { value: 0 }, energy: { value: 0 } }),
  })
  .passthrough();
```

- [ ] **Step 5: Correr (pasan) + suite + tsc**

Run: `npx vitest run src/lib/economy/labor.test.ts src/lib/warera/schemas.test.ts` → PASS.
Run: `npm test` → verde (los tests que usan `workers: [{wage}]` siguen válidos: `user`/`fidelity` son opcionales/default).
Run: `./node_modules/.bin/tsc --noEmit` → exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/economy/labor.ts src/lib/economy/labor.test.ts src/lib/warera/schemas.ts src/lib/warera/schemas.test.ts
git commit -m "feat: parse worker user/fidelity and userLite skills; add energyValueForLevel"
```

---

### Task 2: Helper de aporte de trabajadores

**Files:**
- Create: `src/server/worker-output.ts`, `src/server/worker-output.test.ts`

- [ ] **Step 1: Test (cliente fake)**

`src/server/worker-output.test.ts`:
```ts
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
```

- [ ] **Step 2: Correr (debe fallar)**

Run: `npx vitest run src/server/worker-output.test.ts` → FAIL.

- [ ] **Step 3: Implementar**

`src/server/worker-output.ts`:
```ts
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
```

- [ ] **Step 4: Correr (pasan) + tsc**

Run: `npx vitest run src/server/worker-output.test.ts` → PASS (2).
Run: `./node_modules/.bin/tsc --noEmit` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/server/worker-output.ts src/server/worker-output.test.ts
git commit -m "feat(server): add companyWorkerOutput helper"
```

---

### Task 3: Calibración → factor de tasa + loader

**Files:**
- Create: `src/server/calibration-factor.ts`, `src/server/calibration-factor.test.ts`
- Delete: `src/server/get-constants.ts`, `src/server/get-constants.test.ts`
- Modify: `src/server/calibrate.ts`, `src/server/calibrate.test.ts`

- [ ] **Step 1: Loader `getRateFactor` (reemplaza get-constants)**

Borrar `src/server/get-constants.ts` y `src/server/get-constants.test.ts`.
Crear `src/server/calibration-factor.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { rateFactorFrom } from "./calibration-factor";

describe("rateFactorFrom", () => {
  it("sin calibración → 1 (sin corrección)", () => {
    expect(rateFactorFrom(null)).toBe(1);
  });
  it("con calibración válida → su factor", () => {
    expect(rateFactorFrom({ factor: 0.8, samples: 3, updatedAt: 1 })).toBeCloseTo(0.8);
  });
  it("factor inválido (<=0) → 1", () => {
    expect(rateFactorFrom({ factor: 0, samples: 1, updatedAt: 1 })).toBe(1);
  });
});
```
Crear `src/server/calibration-factor.ts`:
```ts
import type { Calibration } from "@/lib/db/calibration-store";
import { getCalibrationStore } from "@/lib/db/get-calibration-store";

/** Factor de corrección de tasa a partir de una calibración (1 = sin corrección). */
export function rateFactorFrom(c: Calibration | null): number {
  return c && c.factor > 0 ? c.factor : 1;
}

/** Carga el factor de tasa vigente desde el store (server). */
export function getRateFactor(): number {
  return rateFactorFrom(getCalibrationStore().get());
}
```

- [ ] **Step 2: Reescribir `calibrate.ts` (modelo = automatización + trabajadores)**

`runCalibration` pasa a comparar venta real vs **tasa modelada** (no el stock). Reemplazar el cuerpo del cálculo:
1. Importar: `import { automationDailyProd, LABOR_CONSTANTS } from "@/lib/economy";` y `import { companyWorkerOutput } from "./worker-output";`
2. Necesita el `gameConfig`: al inicio, `const gameConfig = await client.getGameConfig();`
3. Cambiar `CalibrationRow` a `{ itemCode: string; modeledPerDay: number; realizedPerDay: number }`.
4. En el armado por empresa, en vez de agrupar producción (stock), agrupar **tasa modelada** por item:
```ts
  const modeledByItem = new Map<string, number>();
  for (const companyId of list.items) {
    const c = await client.getCompanyById(companyId);
    const automation = automationDailyProd(gameConfig.upgradesConfig, c.activeUpgradeLevels.automatedEngine);
    let workerOut = 0;
    try {
      const workers = await client.getWorkers(companyId);
      workerOut = await companyWorkerOutput(client, workers, LABOR_CONSTANTS);
    } catch {
      // sin acceso a trabajadores: se modela solo la automatización
    }
    const modeled = automation + workerOut;
    if (modeled <= 0) continue;
    modeledByItem.set(c.itemCode, (modeledByItem.get(c.itemCode) ?? 0) + modeled);
  }
```
5. Por item, comparar realizado vs modelado:
```ts
  const rows: CalibrationRow[] = [];
  let totalModeled = 0;
  let totalRealized = 0;
  let samples = 0;
  for (const [itemCode, modeledPerDay] of modeledByItem) {
    const realized = await realizedSalesPerDay(client, opts.userId, itemCode, opts.days, now);
    const realizedPerDay = realized ?? 0;
    rows.push({ itemCode, modeledPerDay, realizedPerDay });
    if (realized !== null) {
      totalModeled += modeledPerDay;
      totalRealized += realizedPerDay;
      samples++;
    }
  }
  if (samples === 0 || totalModeled <= 0 || totalRealized <= 0) {
    return { ok: false, reason: "insufficient", rows };
  }
  const factor = totalRealized / totalModeled;
  store.set({ factor, samples, updatedAt: now });
  return { ok: true, factor, samples, rows };
```
(Mantener `now`, `since` se calcula dentro de `realizedSalesPerDay`. Eliminar el `productionByItem` anterior.)

- [ ] **Step 3: Actualizar `calibrate.test.ts`**

El fake client necesita `getGameConfig` (con upgradesConfig) y `getWorkers`. Ajustar para que `modeled = automation` (sin trabajadores) sea predecible y el factor salga del cociente realizado/modelado. Reemplazar el fake y el primer test:
```ts
function fakeClient(over: Partial<Record<string, unknown>> = {}) {
  return {
    getUserCompanies: async () => ({ items: ["c1"] }),
    getCompanyById: async () => ({ _id: "c1", itemCode: "steel", production: 50, workerCount: 0, activeUpgradeLevels: { automatedEngine: 3, breakRoom: 1, storage: 1 } }),
    getGameConfig: async () => ({ items: {}, upgradesConfig: { automatedEngine: { levels: { "3": { stats: { dailyProd: 100 } } } } } }),
    getWorkers: async () => [],
    getUserItemTransactions: async () => ({ items: [{ sellerId: "u1", quantity: 350, createdAt: recent }], nextCursor: null }),
    ...over,
  } as never;
}
```
Primer test:
```ts
  it("deriva factor = venta real/día ÷ tasa modelada y lo persiste", async () => {
    const { store, get } = fakeStore();
    const r = await runCalibration(fakeClient(), store, { userId: "u1", days: 7, now: NOW });
    // realizadas = 350/7 = 50/día ; modelada (automatización L3) = 100 ; factor = 0.5
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");
    expect(r.factor).toBeCloseTo(0.5);
    expect(r.rows[0]).toMatchObject({ itemCode: "steel", modeledPerDay: 100, realizedPerDay: 50 });
    expect(get()?.factor).toBeCloseTo(0.5);
  });
```
Actualizar los otros tests (insuficiente, dedup, fuera de ventana) para el nuevo fake/forma: el de dedup ahora suma tasas modeladas de dos empresas del mismo item (2×100=200 modelado, 350/7=50 realizado → factor 0.25); el de "sin ventas" usa `getUserItemTransactions: async () => ({ items: [], nextCursor: null })` → insufficient.

- [ ] **Step 4: Correr (pasan) + tsc**

Run: `npx vitest run src/server/calibrate.test.ts src/server/calibration-factor.test.ts` → PASS.
Run: `./node_modules/.bin/tsc --noEmit` → exit 0 (no quedan imports a `get-constants`).

- [ ] **Step 5: Commit**

```bash
git add src/server/calibration-factor.ts src/server/calibration-factor.test.ts src/server/calibrate.ts src/server/calibrate.test.ts
git rm src/server/get-constants.ts src/server/get-constants.test.ts
git commit -m "feat(server): recalibrate as daily-rate factor (sales vs modeled rate)"
```

---

### Task 4: Aplicar aporte de trabajadores + factor en los reportes

**Files:**
- Modify: `src/server/company-report.ts`, `src/server/company-report.test.ts`, `src/server/portfolio.ts`, `src/server/portfolio.test.ts`, `src/server/company-detail.ts`, `src/server/company-detail.test.ts`

- [ ] **Step 1: `assembleCompanyReport` — `workerDailyOutput` + `rateFactor`**

En `src/server/company-report.ts`, añadir a los args: `workerDailyOutput?: number;` y `rateFactor?: number;`. Cambiar el cálculo de la tasa:
```ts
  const automation = automationDailyProd(args.upgradesConfig, args.company.upgrades.automatedEngine);
  const dailyProductionRate = (automation + (args.workerDailyOutput ?? 0)) * (args.rateFactor ?? 1);
```
(El resto igual: `companyProfit({ dailyProductionRate, ... })`, stock/storageMax, maxWage.)

Añadir test:
```ts
  it("suma el aporte de trabajadores y aplica el factor de tasa", () => {
    const r = assembleCompanyReport({
      company, item: bread, workers: [], prices, taxes, upgradesConfig,
      workerDailyOutput: 28, rateFactor: 0.5,
    });
    // (72 automatización + 28 trabajadores) × 0.5 = 50
    expect(r.dailyProductionRate).toBe(50);
  });
```

- [ ] **Step 2: `buildPortfolio` — recibe `rateFactor` por opción (las rutas lo inyectan)**

Para que los servicios NO toquen disco en los tests, el factor fluye desde la ruta (no se lee dentro del servicio).
- En `src/server/portfolio.ts`: añadir `rateFactor?: number` a `BuildPortfolioOptions`; pasar `rateFactor: opts.rateFactor` a cada `assembleCompanyReport`. (El portfolio NO calcula aporte de trabajadores —costoso por empresa—; deja `workerDailyOutput` en 0 y solo aplica el factor.)
- En `src/app/api/report/route.ts`: importar `getRateFactor` de `@/server/calibration-factor` y pasar `rateFactor: getRateFactor()` a `buildPortfolio`.
- `portfolio.test.ts`: no pasa `rateFactor` → `assembleCompanyReport` usa default 1 → valores sin cambio, sigue verde. `report/route.test.ts` usa `objectContaining` → sigue verde.

- [ ] **Step 3: `buildCompanyDetail` — aporte de trabajadores + factor por opción**

En `src/server/company-detail.ts`:
- Importar `companyWorkerOutput` de `./worker-output`, `LABOR_CONSTANTS` de `@/lib/economy`.
- Añadir `rateFactor?: number` a `BuildCompanyDetailOptions`.
- Calcular el aporte con token: `const workerDailyOutput = opts.authenticated ? await companyWorkerOutput(client, workers, LABOR_CONSTANTS) : 0;`
- Pasar `workerDailyOutput` y `rateFactor: opts.rateFactor` a `assembleCompanyReport` (en `reportWithSell`).
- En `src/app/api/company/[id]/route.ts`: pasar `rateFactor: getRateFactor()` (import de `@/server/calibration-factor`) a `buildCompanyDetail`.

Ajustar `company-detail.test.ts`: añadir `getUserLite` con `skills` al fake client (para `companyWorkerOutput`). Con `workers: [{ wage:1 },{ wage:2 }]` SIN `user`, el aporte es 0 (se ignoran), así que `dailyProductionRate` sigue siendo la automatización (factor default 1) → las aserciones existentes siguen válidas. Verificar verde. `company/[id]/route.test.ts` usa `objectContaining` → sigue verde.

- [ ] **Step 4: Correr suite + tsc**

Run: `npm test` → todo verde.
Run: `./node_modules/.bin/tsc --noEmit` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/server/company-report.ts src/server/company-report.test.ts src/server/portfolio.ts src/server/portfolio.test.ts src/server/company-detail.ts src/server/company-detail.test.ts src/app/api/report/route.ts "src/app/api/company/[id]/route.ts"
git commit -m "feat(server): add worker output and rate factor to reports"
```

---

### Task 5: UI — textos de calibración + línea de trabajadores

**Files:**
- Modify: `src/app/calibrate/page.tsx`, `src/components/detail/breakdown.tsx`, `src/components/detail/breakdown.test.tsx`

- [ ] **Step 1: Textos de la página de calibración**

En `src/app/calibrate/page.tsx`:
- Cambiar la descripción a: "Compara lo que tus empresas **producen** (automatización + trabajadores) contra lo que **vendés** (últimos 7 días) y ajusta la tasa con un factor."
- En la tabla de resultados, cambiar los headers de columnas a `Item` / `Modelado/día` / `Vendido/día` y las celdas a `r.modeledPerDay` y `r.realizedPerDay` (antes `productionPerDay`).
- En la tarjeta de éxito, el texto: "Calibrado ✓ — factor {factor}. Las tasas se ajustan ×{factor}."

- [ ] **Step 2: Línea de trabajadores en el desglose (opcional informativa)**

En `src/components/detail/breakdown.tsx`, no se requieren campos nuevos (la tasa ya incluye trabajadores). Mantener "Producción/día" (que ahora ya incluye el aporte). Sin cambios de datos; este step solo confirma que `breakdown.test.tsx` sigue verde tras los cambios de tasa (el `profit` del test es directo, no depende de trabajadores).

- [ ] **Step 3: Correr tests + tsc + build**

Run: `npm test` → verde.
Run: `./node_modules/.bin/tsc --noEmit` → exit 0.
Run: `npm run build` → compila.

- [ ] **Step 4: Commit**

```bash
git add src/app/calibrate/page.tsx src/components/detail/breakdown.tsx src/components/detail/breakdown.test.tsx
git commit -m "feat(ui): update calibration copy to rate-factor model"
```

---

## Verificación final del Plan 7C

- [ ] `npm test` → todos verdes (incl. worker-output, calibration-factor, calibrate reescrito, schemas).
- [ ] `./node_modules/.bin/tsc --noEmit` → exit 0; `npm run build` → compila.
- [ ] Flujo en vivo (BebetoSan, **con su API token** pegado en onboarding):
  - Detalle de una empresa con trabajadores: la "Producción/día" incluye el aporte de los trabajadores (mayor que solo la automatización).
  - `/calibrate` → "Calibrar con mis ventas": muestra Modelado/día vs Vendido/día y el factor; tras calibrar, las tasas del dashboard/detalle se ajustan ×factor. Para empresas sin trabajadores, el factor valida la automatización (≈1).
- [ ] Verificación visual con Playwright (`/calibrate` con la nueva tabla; detalle con la tasa que incluye trabajadores).

## Notas para el Plan 6B

- Beneficio al **precio actual** (ya) + **indicador de tendencia** del precio del item (actual vs promedio reciente del histórico, Plan 3) en tarjeta de empresa y detalle (+ mini-gráfico).
