# WarEra Company Manager — Plan 6B: Beneficio al precio actual + indicador de tendencia

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El beneficio ya usa el precio de mercado actual; este plan agrega el **contexto de tendencia**: por el item de cada empresa, comparar el precio actual contra el promedio reciente del histórico (Plan 3) y mostrar ▲/▼/— + promedio en la tarjeta del dashboard y en el detalle, con un mini-gráfico de tendencia en el detalle.

**Architecture:** Un helper puro (`priceTrend`/`averagePrice`) clasifica la tendencia (actual vs promedio, con umbral). Los servicios (`buildPortfolio`/`buildCompanyDetail`) calculan, por el item de salida de cada empresa, `{ current, avg, trend }` leyendo el `PriceHistoryStore` (Plan 3) que las **rutas inyectan** (servicios disk-free para los tests). `CompanyReport` gana `price?`. La UI muestra un `PriceTrendBadge` reutilizable en la tarjeta y el detalle; el detalle suma el componente `PriceTrend` (Plan 3) como mini-gráfico del item.

**Tech Stack:** Next.js 16, TypeScript, Vitest, Recharts (ya presente).

Spec: `docs/superpowers/specs/2026-06-17-calibration-and-api-key-tutorial-design.md` (§4bis "Parte C"). Es el último plan de la hoja de ruta.

---

## Decisiones de alcance (6B)

- **Número de beneficio = precio actual** (sin cambios). Se AGREGA el indicador de tendencia (informativo).
- **Promedio** = media de los snapshots del histórico del item en una ventana (default 7 días). `trend` = `up` si actual > prom×(1+u), `down` si < prom×(1−u), si no `flat` (umbral u=3%).
- **Sin histórico suficiente** (DB recién iniciada): `price` queda `undefined` → la UI muestra solo el precio actual, sin tendencia. Nada inventado.
- **El store se inyecta desde las rutas** (`getPriceStore()`), igual que `rateFactor`; los servicios no leen disco en los tests.
- **Mini-gráfico del detalle**: reusa el componente `PriceTrend` (Plan 3) que ya hace fetch del histórico client-side; no requiere backend nuevo.

## Estructura de archivos

- `src/lib/economy/price-trend.ts` (+test) — `averagePrice`, `priceTrend`, tipo `PriceTrendInfo` (Task 1)
- `src/server/company-report.ts` (+test) — `priceInfo?` en `CompanyReport` (Task 2)
- `src/server/portfolio.ts`, `src/server/company-detail.ts` (+tests), `src/app/api/report/route.ts`, `src/app/api/company/[id]/route.ts` — computar/inyectar (Task 2)
- `src/components/price-trend-badge.tsx` (+test) — indicador reutilizable (Task 3)
- `src/components/dashboard/company-card.tsx` (+test) — badge en la tarjeta (Task 3)
- `src/app/company/[id]/page.tsx` — badge + mini-gráfico `PriceTrend` (Task 4)

**Entorno:** typecheck `./node_modules/.bin/tsc --noEmit`. Tests `npm test`. Build `npm run build`.

---

### Task 1: Helper de tendencia de precio (puro)

**Files:**
- Create: `src/lib/economy/price-trend.ts`, `src/lib/economy/price-trend.test.ts`
- Modify: `src/lib/economy/index.ts`

- [ ] **Step 1: Test**

```ts
import { describe, it, expect } from "vitest";
import { averagePrice, priceTrend } from "./price-trend";

describe("price trend", () => {
  it("averagePrice promedia los precios de los puntos", () => {
    expect(averagePrice([{ ts: 1, price: 1 }, { ts: 2, price: 3 }])).toBeCloseTo(2);
    expect(averagePrice([])).toBeNull();
  });

  it("priceTrend clasifica con umbral 3%", () => {
    expect(priceTrend(1.1, 1.0).trend).toBe("up"); // +10%
    expect(priceTrend(0.9, 1.0).trend).toBe("down"); // -10%
    expect(priceTrend(1.01, 1.0).trend).toBe("flat"); // +1% < 3%
  });

  it("priceTrend devuelve current y avg", () => {
    const r = priceTrend(1.2, 1.0);
    expect(r.current).toBeCloseTo(1.2);
    expect(r.avg).toBeCloseTo(1.0);
  });
});
```

- [ ] **Step 2: Correr (debe fallar)**

Run: `npx vitest run src/lib/economy/price-trend.test.ts` → FAIL.

- [ ] **Step 3: Implementar**

```ts
export type Trend = "up" | "down" | "flat";

export interface PricePointLite {
  ts: number;
  price: number;
}

export interface PriceTrendInfo {
  current: number;
  avg: number;
  trend: Trend;
}

/** Promedio de precios de una serie; null si está vacía. */
export function averagePrice(points: PricePointLite[]): number | null {
  if (points.length === 0) return null;
  return points.reduce((sum, p) => sum + p.price, 0) / points.length;
}

/** Clasifica la tendencia del precio actual vs el promedio (umbral relativo, default 3%). */
export function priceTrend(current: number, avg: number, thresholdPct = 0.03): PriceTrendInfo {
  let trend: Trend = "flat";
  if (avg > 0) {
    if (current > avg * (1 + thresholdPct)) trend = "up";
    else if (current < avg * (1 - thresholdPct)) trend = "down";
  }
  return { current, avg, trend };
}
```

- [ ] **Step 4: Correr (pasan) + barrel + tsc**

Run: `npx vitest run src/lib/economy/price-trend.test.ts` → PASS (3).
Añadir a `src/lib/economy/index.ts`: `export * from "./price-trend";`
Run: `./node_modules/.bin/tsc --noEmit` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/economy/price-trend.ts src/lib/economy/price-trend.test.ts src/lib/economy/index.ts
git commit -m "feat(economy): add price trend helper"
```

---

### Task 2: Enriquecer los reportes con la tendencia de precio

**Files:**
- Modify: `src/server/company-report.ts`, `src/server/company-report.test.ts`, `src/server/portfolio.ts`, `src/server/portfolio.test.ts`, `src/server/company-detail.ts`, `src/server/company-detail.test.ts`, `src/app/api/report/route.ts`, `src/app/api/company/[id]/route.ts`

- [ ] **Step 1: `CompanyReport.price` + arg en `assembleCompanyReport`**

En `src/server/company-report.ts`:
- Importar el tipo: `import type { PriceTrendInfo } from "@/lib/economy";`
- Añadir a la interface `CompanyReport`: `price?: PriceTrendInfo;`
- Añadir a los args de `assembleCompanyReport`: `priceInfo?: PriceTrendInfo;` y devolver `price: args.priceInfo` en el objeto retornado.

Añadir test:
```ts
  it("incluye la tendencia de precio cuando se provee", () => {
    const r = assembleCompanyReport({
      company, item: bread, workers: [], prices, taxes, upgradesConfig,
      priceInfo: { current: 1.6, avg: 1.4, trend: "up" },
    });
    expect(r.price).toEqual({ current: 1.6, avg: 1.4, trend: "up" });
  });
```

- [ ] **Step 2: Helper de cómputo en los servicios**

Para no repetir, crear una función local en cada servicio (o un helper compartido). Crear `src/server/price-trend-for.ts`:
```ts
import type { PriceHistoryStore } from "@/lib/db/price-store";
import { averagePrice, priceTrend, type PriceTrendInfo } from "@/lib/economy";
import type { PriceMap } from "@/lib/economy";

/** Tendencia de precio del item según el histórico (null si falta store o datos). */
export function priceTrendFor(
  store: PriceHistoryStore | undefined,
  itemCode: string,
  prices: PriceMap,
  days = 7,
): PriceTrendInfo | undefined {
  if (!store) return undefined;
  const current = prices[itemCode];
  if (current === undefined) return undefined;
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const avg = averagePrice(store.getHistory(itemCode, since));
  if (avg === null) return undefined;
  return priceTrend(current, avg);
}
```
Con su test `src/server/price-trend-for.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { priceTrendFor } from "./price-trend-for";

function store(points: { ts: number; price: number }[]) {
  return { getHistory: () => points, recordSnapshot: () => {}, listItems: () => [] };
}

describe("priceTrendFor", () => {
  it("sin store → undefined", () => {
    expect(priceTrendFor(undefined, "steel", { steel: 1.5 })).toBeUndefined();
  });
  it("sin histórico → undefined", () => {
    expect(priceTrendFor(store([]), "steel", { steel: 1.5 })).toBeUndefined();
  });
  it("con histórico → tendencia", () => {
    const r = priceTrendFor(store([{ ts: 1, price: 1.0 }, { ts: 2, price: 1.0 }]), "steel", { steel: 1.2 });
    expect(r?.trend).toBe("up");
    expect(r?.avg).toBeCloseTo(1.0);
  });
});
```

- [ ] **Step 3: `buildPortfolio` / `buildCompanyDetail` inyectan store y computan**

- En ambos: añadir `priceStore?: PriceHistoryStore` a las options; al armar cada reporte, pasar `priceInfo: priceTrendFor(opts.priceStore, c.itemCode, prices)` a `assembleCompanyReport`.
- Importar `priceTrendFor` y el tipo `PriceHistoryStore`.

- [ ] **Step 4: Rutas inyectan `getPriceStore()`**

- `src/app/api/report/route.ts`: importar `getPriceStore` de `@/lib/db/get-price-store`; pasar `priceStore: getPriceStore()` a `buildPortfolio`.
- `src/app/api/company/[id]/route.ts`: igual para `buildCompanyDetail`.

- [ ] **Step 5: Tests de servicio**

`portfolio.test.ts` / `company-detail.test.ts`: no pasan `priceStore` → `price` queda `undefined` → tests existentes siguen verdes. Añadir un test que pase un `priceStore` fake y verifique `r.companies[0].price?.trend`:
```ts
  it("incluye tendencia de precio si se inyecta el store", async () => {
    const priceStore = { getHistory: () => [{ ts: 1, price: 1.0 }, { ts: 2, price: 1.0 }], recordSnapshot: () => {}, listItems: () => [] } as never;
    const r = await buildPortfolio(fakeClient(), { userId: "u1", authenticated: true, priceStore });
    // precio actual bread 1.5 vs prom 1.0 → up
    expect(r.companies[0].price?.trend).toBe("up");
  });
```

- [ ] **Step 6: Correr suite + tsc**

Run: `npm test` → todo verde.
Run: `./node_modules/.bin/tsc --noEmit` → exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/server/company-report.ts src/server/company-report.test.ts src/server/price-trend-for.ts src/server/price-trend-for.test.ts src/server/portfolio.ts src/server/portfolio.test.ts src/server/company-detail.ts src/server/company-detail.test.ts src/app/api/report/route.ts "src/app/api/company/[id]/route.ts"
git commit -m "feat(server): enrich reports with output-item price trend"
```

---

### Task 3: `PriceTrendBadge` + indicador en la tarjeta

**Files:**
- Create: `src/components/price-trend-badge.tsx`, `src/components/price-trend-badge.test.tsx`
- Modify: `src/components/dashboard/company-card.tsx`, `src/components/dashboard/company-card.test.tsx`

- [ ] **Step 1: Componente `PriceTrendBadge`**

`src/components/price-trend-badge.tsx`:
```tsx
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { formatMoney } from "@/lib/format";
import type { PriceTrendInfo } from "@/lib/economy";

const CFG = {
  up: { icon: TrendingUp, cls: "text-success", label: "subiendo" },
  down: { icon: TrendingDown, cls: "text-destructive", label: "bajando" },
  flat: { icon: Minus, cls: "text-muted-foreground", label: "estable" },
} as const;

/** Indicador de tendencia del precio del item (actual vs promedio reciente). */
export function PriceTrendBadge({ price }: { price: PriceTrendInfo }) {
  const cfg = CFG[price.trend];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${cfg.cls}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="sr-only">Precio {cfg.label}.</span>
      <span className="tabular">{formatMoney(price.current)}</span>
      <span className="text-muted-foreground">(prom {formatMoney(price.avg)})</span>
    </span>
  );
}
```

- [ ] **Step 2: Test del badge**

`src/components/price-trend-badge.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PriceTrendBadge } from "./price-trend-badge";

describe("PriceTrendBadge", () => {
  it("muestra precio actual, promedio y etiqueta accesible", () => {
    render(<PriceTrendBadge price={{ current: 1.6, avg: 1.4, trend: "up" }} />);
    expect(screen.getByText("1.60")).toBeInTheDocument();
    expect(screen.getByText("(prom 1.40)")).toBeInTheDocument();
    expect(screen.getByText("Precio subiendo.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Usar el badge en `company-card.tsx`**

En `src/components/dashboard/company-card.tsx`, importar `PriceTrendBadge` y, si `company.price` existe, mostrarlo (p.ej. debajo del `dl`, antes del hint de contratar):
```tsx
        {company.price ? (
          <div className="mt-2">
            <PriceTrendBadge price={company.price} />
          </div>
        ) : null}
```

- [ ] **Step 4: Test de la tarjeta**

En `src/components/dashboard/company-card.test.tsx`, en el `report()` fake agregar `price: { current: 1.6, avg: 1.4, trend: "up" as const }` y una aserción:
```tsx
    expect(screen.getByText("(prom 1.40)")).toBeInTheDocument();
```

- [ ] **Step 5: Correr + tsc**

Run: `npx vitest run src/components/price-trend-badge.test.tsx src/components/dashboard/company-card.test.tsx` → PASS.
Run: `npm test` → verde; `./node_modules/.bin/tsc --noEmit` → exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/components/price-trend-badge.tsx src/components/price-trend-badge.test.tsx src/components/dashboard/company-card.tsx src/components/dashboard/company-card.test.tsx
git commit -m "feat(ui): add price trend badge to company card"
```

---

### Task 4: Tendencia + mini-gráfico en el detalle

**Files:**
- Modify: `src/app/company/[id]/page.tsx`

- [ ] **Step 1: Badge + mini-gráfico en el detalle**

En `src/app/company/[id]/page.tsx`:
- Importar `PriceTrendBadge` de `@/components/price-trend-badge` y `PriceTrend` de `@/components/market/price-trend`.
- Junto al beneficio (debajo del número), si `data.report.price` existe, mostrar `<PriceTrendBadge price={data.report.price} />`.
- Añadir una `Card` "Tendencia de precio" con el mini-gráfico del item:
```tsx
              <Card className="cursor-default">
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Tendencia de precio · <span className="font-mono normal-case">{data.itemCode}</span>
                </h2>
                <PriceTrend item={data.itemCode} />
              </Card>
```
(Insertarla, por ejemplo, después de la card de Mejoras y antes/después de la receta.)

- [ ] **Step 2: tsc + build**

Run: `./node_modules/.bin/tsc --noEmit` → exit 0.
Run: `npm run build` → compila.

- [ ] **Step 3: Commit**

```bash
git add "src/app/company/[id]/page.tsx"
git commit -m "feat(ui): add price trend and mini-chart to company detail"
```

---

## Verificación final del Plan 6B

- [ ] `npm test` → todos verdes (incl. price-trend, price-trend-for, price-trend-badge, reportes).
- [ ] `./node_modules/.bin/tsc --noEmit` → exit 0; `npm run build` → compila.
- [ ] Flujo en vivo (tras correr `npm run collect` un par de veces para tener histórico):
  - Dashboard: las tarjetas muestran el badge ▲/▼/— con precio actual y promedio (si hay histórico).
  - Detalle: badge de tendencia + mini-gráfico del precio del item.
  - Sin histórico: no aparece el badge (solo el resto).
- [ ] Verificación visual con Playwright (tarjeta + detalle con la tendencia).

## Cierre de la hoja de ruta

Con 6B se completan todas las features planificadas. Pendiente futuro (no planificado): **despliegue** (Vercel + Vercel Cron + migrar `PriceHistoryStore`/`CalibrationStore` a Postgres) y, opcionalmente, calibrar `LABOR_CONSTANTS.throughputFactor` con datos reales del usuario (su token).
