# WarEra Company Manager — Plan 5: Detalle de empresa + Optimizador + Mercado

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Completar las pantallas profundas de la app: detalle de una empresa (desglose ingresos/costos, trabajadores, recomendación de contratación, niveles de mejora, receta de producción), el optimizador "mejor qué producir" (tabla ordenable), y el mercado de precios (tabla ordenable/buscable). Las tendencias del mercado quedan para el Plan 3 (histórico).

**Architecture:** Reusa el motor económico (Plan 1) y el backend (Plan 2). Se extrae un helper compartido `assembleCompanyReport` (DRY entre cartera y detalle), se agrega el servicio `buildCompanyDetail` y el endpoint `/api/company/[id]`. La UI (Plan 4) suma 3 páginas cliente que consumen `/api/company/[id]`, `/api/optimizer`, `/api/prices` vía React Query, siguiendo el sistema de diseño oscuro "command center". Lógica pura (estado de trabajador, orden de tablas) aislada y testeada.

**Tech Stack:** Next.js 16, TypeScript, Tailwind v4, @tanstack/react-query, lucide-react, Vitest + @testing-library/react.

Spec: `docs/superpowers/specs/2026-06-16-warera-company-manager-design.md` (§8 pantallas 3–5). Diseño: `design-system/warera-company-manager/MASTER.md`. Usuario real de prueba: `BebetoSan`, userId `6a141b049be11c48c9d30c50` (4 empresas: steel, iron, oil, petroleum).

---

## Decisiones de diseño de este plan

- **ROI de mejoras: diferido.** El endpoint `upgrade.getUpgradeByTypeAndEntity` devuelve recursos invertidos, no un delta de ganancia, y la producción no está calibrada. En el detalle mostramos los **niveles de mejora actuales** (info) sin inventar un ROI. El cálculo de payback llega cuando se calibre (post Plan 3).
- **Trabajadores requieren token** (auth-gated). Sin token: lista vacía + `wagesAvailable:false`, mismo patrón que la cartera.
- **"Salario máximo a pagar"** = valor marginal del motor (`hiringAnalysis.maxWage`); se marca como estimado.
- **Trabajador sobrepagado** = `wage > maxWage`.
- **Tendencias de mercado: diferidas al Plan 3.** El `/market` muestra precios actuales (tabla); el histórico/gráfico llega después.

## Estructura de archivos (Plan 5)

- `src/lib/warera/schemas.ts` — MOD: `workerInfoSchema` ya cubierto por `workersSchema` (sin cambios salvo confirmar)
- `src/server/company-report.ts` — NEW: `assembleCompanyReport` (helper puro) (Task 1)
- `src/server/portfolio.ts` — MOD: usar el helper (DRY) (Task 1)
- `src/server/company-detail.ts` — NEW: `buildCompanyDetail` + tipos (Task 2)
- `src/app/api/company/[id]/route.ts` — NEW: endpoint (Task 3)
- `src/lib/ui/worker-status.ts` — NEW: `isOverpaid` (Task 4)
- `src/lib/ui/sort-table.ts` — NEW: `sortBy` helper (Task 4)
- `src/lib/client/use-company-detail.ts`, `use-optimizer.ts`, `use-prices.ts` — NEW hooks (Task 5)
- `src/components/detail/*` — NEW: breakdown, workers, upgrades, recipe (Task 6)
- `src/app/company/[id]/page.tsx` — NEW: detalle (Task 6)
- `src/app/optimizer/page.tsx` — NEW: optimizador (Task 7)
- `src/app/market/page.tsx` — NEW: mercado (Task 8)
- `src/components/app-shell.tsx` — MOD: link "Optimizador" (Task 9)

Tests: lógica pura `*.test.ts`; componentes/fetch `*.test.tsx`/`*.test.ts` (jsdom).

**Entorno:** typecheck `./node_modules/.bin/tsc --noEmit`. Tests `npm test`. Build `npm run build`.

---

### Task 1: Helper compartido `assembleCompanyReport` (DRY)

**Files:**
- Create: `src/server/company-report.ts`, `src/server/company-report.test.ts`
- Modify: `src/server/portfolio.ts`

- [ ] **Step 1: Escribir el test del helper**

`src/server/company-report.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { assembleCompanyReport } from "./company-report";
import type { ItemDef, Taxes, PriceMap } from "@/lib/economy";

const bread: ItemDef = { code: "bread", type: "product", productionPoints: 1, productionNeeds: { grain: 2 } };
const company = { id: "c1", itemCode: "bread", production: 10, workerCount: 2, upgrades: { automatedEngine: 0, breakRoom: 0 } };
const prices: PriceMap = { bread: 1.5, grain: 0.1 };
const taxes: Taxes = { income: 0, market: 10, selfWork: 0 };

describe("assembleCompanyReport", () => {
  it("arma profit + hiring + maxWageToHire", () => {
    const r = assembleCompanyReport({ company, item: bread, workers: [{ wage: 1 }, { wage: 2 }], prices, taxes });
    expect(r.id).toBe("c1");
    expect(r.itemCode).toBe("bread");
    expect(r.profit.netProfit).toBeCloseTo(8.5);
    expect(r.maxWageToHire).toBeCloseTo(r.hiring.maxWage);
  });
});
```

- [ ] **Step 2: Correr (debe fallar)**

Run: `npx vitest run src/server/company-report.test.ts` → FAIL.

- [ ] **Step 3: Implementar el helper**

`src/server/company-report.ts`:
```ts
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
```

- [ ] **Step 4: Refactorizar `portfolio.ts` para usar el helper**

En `src/server/portfolio.ts`:
1. Borrar la interface local `CompanyReport` y los imports de `companyProfit`/`hiringAnalysis`/`ProfitBreakdown`/`HiringResult` que ya no se usen directamente.
2. Importar desde el helper: `import { assembleCompanyReport, type CompanyReport } from "./company-report";` y re-exportarlo: `export type { CompanyReport };`
3. Reemplazar el cuerpo del bucle que calcula `profit`/`hiring`/`push` por:
```ts
    const report = assembleCompanyReport({ company, item, workers, prices, taxes });
    companies.push(report);
```
(Mantener todo lo demás igual: el fetch de company, el try/catch de workers, el `toItemDef`, el armado de `company`, y los flags `wagesAvailable`/`estimated`/`totalNetProfit`.)

- [ ] **Step 5: Correr (helper pasa, portfolio sigue verde) + tsc**

Run: `npx vitest run src/server/company-report.test.ts src/server/portfolio.test.ts` → PASS (todos).
Run: `./node_modules/.bin/tsc --noEmit` → exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/server/company-report.ts src/server/company-report.test.ts src/server/portfolio.ts
git commit -m "refactor(server): extract shared assembleCompanyReport helper"
```

---

### Task 2: Servicio `buildCompanyDetail`

**Files:**
- Create: `src/server/company-detail.ts`, `src/server/company-detail.test.ts`

- [ ] **Step 1: Escribir el test (cliente fake)**

`src/server/company-detail.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildCompanyDetail } from "./company-detail";

function fakeClient(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    getUserLite: async () => ({ _id: "u1", username: "me", country: "co1" }),
    getCountryById: async () => ({ taxes: { income: 0, market: 10, selfWork: 0 } }),
    getCompanyById: async () => ({
      _id: "c1",
      itemCode: "bread",
      production: 10,
      workerCount: 2,
      activeUpgradeLevels: { automatedEngine: 3, breakRoom: 1 },
    }),
    getWorkers: async () => [{ wage: 1 }, { wage: 2 }],
    getPrices: async () => ({ bread: 1.5, grain: 0.1 }),
    getGameConfig: async () => ({
      items: { bread: { type: "product", productionPoints: 1, productionNeeds: { grain: 2 } } },
    }),
    ...overrides,
  } as never;
}

describe("buildCompanyDetail", () => {
  it("arma el detalle con desglose, trabajadores, upgrades y receta", async () => {
    const d = await buildCompanyDetail(fakeClient(), { companyId: "c1", userId: "u1", authenticated: true });
    expect(d.itemCode).toBe("bread");
    expect(d.report.profit.netProfit).toBeCloseTo(8.5);
    expect(d.workers).toHaveLength(2);
    expect(d.wagesAvailable).toBe(true);
    expect(d.upgrades.automatedEngine).toBe(3);
    expect(d.recipe).toEqual([{ input: "grain", qtyPerUnit: 2 }]);
  });

  it("sin auth: no lee trabajadores, wagesAvailable=false", async () => {
    let called = false;
    const client = fakeClient({ getWorkers: async () => { called = true; return []; } });
    const d = await buildCompanyDetail(client, { companyId: "c1", userId: "u1", authenticated: false });
    expect(called).toBe(false);
    expect(d.workers).toEqual([]);
    expect(d.wagesAvailable).toBe(false);
  });
});
```

- [ ] **Step 2: Correr (debe fallar)**

Run: `npx vitest run src/server/company-detail.test.ts` → FAIL.

- [ ] **Step 3: Implementar el servicio**

`src/server/company-detail.ts`:
```ts
import type { WareraClient } from "@/lib/warera/client";
import { toItemDef } from "@/lib/economy";
import { assembleCompanyReport, type CompanyReport } from "./company-report";

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

  const report = assembleCompanyReport({ company, item, workers, prices, taxes });
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
```

- [ ] **Step 4: Correr (pasa) + tsc**

Run: `npx vitest run src/server/company-detail.test.ts` → PASS (2 tests).
Run: `./node_modules/.bin/tsc --noEmit` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/server/company-detail.ts src/server/company-detail.test.ts
git commit -m "feat(server): add buildCompanyDetail service"
```

---

### Task 3: Endpoint `/api/company/[id]`

**Files:**
- Create: `src/app/api/company/[id]/route.ts`, `src/app/api/company/[id]/route.test.ts`

- [ ] **Step 1: Escribir el test**

`src/app/api/company/[id]/route.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from "vitest";
vi.mock("@/server/company-detail", () => ({ buildCompanyDetail: vi.fn() }));
import { buildCompanyDetail } from "@/server/company-detail";
import { GET } from "./route";

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}
afterEach(() => vi.restoreAllMocks());

describe("GET /api/company/[id]", () => {
  it("400 si falta userId", async () => {
    const res = await GET(new Request("http://localhost/api/company/c1"), ctx("c1"));
    expect(res.status).toBe(400);
  });

  it("devuelve el detalle con userId y pasa authenticated según X-API-Key", async () => {
    const mock = buildCompanyDetail as unknown as ReturnType<typeof vi.fn>;
    mock.mockResolvedValueOnce({ id: "c1", itemCode: "bread" });
    const res = await GET(
      new Request("http://localhost/api/company/c1?userId=u1", { headers: { "X-API-Key": "tok" } }),
      ctx("c1"),
    );
    expect(res.status).toBe(200);
    expect(mock).toHaveBeenCalledWith(expect.anything(), { companyId: "c1", userId: "u1", authenticated: true });
  });

  it("502 si el servicio falla", async () => {
    (buildCompanyDetail as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("upstream"));
    const res = await GET(new Request("http://localhost/api/company/c1?userId=u1"), ctx("c1"));
    expect(res.status).toBe(502);
  });
});
```

- [ ] **Step 2: Correr (debe fallar)**

Run: `npx vitest run "src/app/api/company/[id]/route.test.ts"` → FAIL.

- [ ] **Step 3: Implementar**

`src/app/api/company/[id]/route.ts`:
```ts
import { WareraClient } from "@/lib/warera/client";
import { buildCompanyDetail } from "@/server/company-detail";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  const userId = new URL(req.url).searchParams.get("userId");
  if (!userId) {
    return Response.json({ error: "userId is required" }, { status: 400 });
  }
  const apiKey = req.headers.get("x-api-key") ?? undefined;
  const client = new WareraClient({ apiKey });
  try {
    const detail = await buildCompanyDetail(client, {
      companyId: id,
      userId,
      authenticated: Boolean(apiKey),
    });
    return Response.json(detail);
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    return Response.json({ error: message }, { status: 502 });
  }
}
```

- [ ] **Step 4: Correr (pasa) + tsc**

Run: `npx vitest run "src/app/api/company/[id]/route.test.ts"` → PASS (3 tests).
Run: `./node_modules/.bin/tsc --noEmit` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/company/[id]/"
git commit -m "feat(api): add /api/company/[id] detail endpoint"
```

---

### Task 4: Utilidades puras (estado de trabajador + orden de tabla)

**Files:**
- Create: `src/lib/ui/worker-status.ts`, `src/lib/ui/worker-status.test.ts`, `src/lib/ui/sort-table.ts`, `src/lib/ui/sort-table.test.ts`

- [ ] **Step 1: Tests**

`src/lib/ui/worker-status.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { isOverpaid } from "./worker-status";

describe("isOverpaid", () => {
  it("true si el salario supera el valor marginal máximo", () => {
    expect(isOverpaid(6, 5)).toBe(true);
  });
  it("false si el salario es menor o igual", () => {
    expect(isOverpaid(5, 5)).toBe(false);
    expect(isOverpaid(3, 5)).toBe(false);
  });
});
```

`src/lib/ui/sort-table.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { sortBy } from "./sort-table";

const rows = [
  { name: "b", v: 2 },
  { name: "a", v: 3 },
  { name: "c", v: 1 },
];

describe("sortBy", () => {
  it("ordena numérico descendente", () => {
    expect(sortBy(rows, "v", "desc").map((r) => r.v)).toEqual([3, 2, 1]);
  });
  it("ordena numérico ascendente", () => {
    expect(sortBy(rows, "v", "asc").map((r) => r.v)).toEqual([1, 2, 3]);
  });
  it("ordena texto ascendente", () => {
    expect(sortBy(rows, "name", "asc").map((r) => r.name)).toEqual(["a", "b", "c"]);
  });
  it("no muta el array original", () => {
    const copy = [...rows];
    sortBy(rows, "v", "asc");
    expect(rows).toEqual(copy);
  });
});
```

- [ ] **Step 2: Correr (deben fallar)**

Run: `npx vitest run src/lib/ui/worker-status.test.ts src/lib/ui/sort-table.test.ts` → FAIL.

- [ ] **Step 3: Implementar**

`src/lib/ui/worker-status.ts`:
```ts
/** Un trabajador está sobrepagado si su salario supera el valor marginal máximo. */
export function isOverpaid(wage: number, maxWage: number): boolean {
  return wage > maxWage;
}
```

`src/lib/ui/sort-table.ts`:
```ts
export type SortDir = "asc" | "desc";

/** Ordena una copia de `rows` por `key`. Soporta number y string. */
export function sortBy<T>(rows: T[], key: keyof T, dir: SortDir): T[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * sign;
    return String(av).localeCompare(String(bv)) * sign;
  });
}
```

- [ ] **Step 4: Correr (pasan) + tsc**

Run: `npx vitest run src/lib/ui/worker-status.test.ts src/lib/ui/sort-table.test.ts` → PASS.
Run: `./node_modules/.bin/tsc --noEmit` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ui/worker-status.ts src/lib/ui/worker-status.test.ts src/lib/ui/sort-table.ts src/lib/ui/sort-table.test.ts
git commit -m "feat(ui): add worker-status and table sort utilities"
```

---

### Task 5: Hooks de datos (detalle, optimizador, precios)

**Files:**
- Create: `src/lib/client/use-company-detail.ts` (+ test), `src/lib/client/use-optimizer.ts`, `src/lib/client/use-prices.ts`

- [ ] **Step 1: Test de `fetchCompanyDetail`**

`src/lib/client/use-company-detail.test.ts`:
```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchCompanyDetail } from "./use-company-detail";

afterEach(() => vi.restoreAllMocks());

describe("fetchCompanyDetail", () => {
  it("llama a /api/company/:id?userId= y agrega X-API-Key si hay token", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ id: "c1" })));
    await fetchCompanyDetail("c1", "u1", "tok");
    const [url, opts] = spy.mock.calls[0];
    expect(url).toBe("/api/company/c1?userId=u1");
    expect((opts?.headers as Record<string, string>)["X-API-Key"]).toBe("tok");
  });

  it("lanza si no es ok", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("e", { status: 502 }));
    await expect(fetchCompanyDetail("c1", "u1", null)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Correr (debe fallar)**

Run: `npx vitest run src/lib/client/use-company-detail.test.ts` → FAIL.

- [ ] **Step 3: Implementar `use-company-detail.ts`**

```ts
"use client";
import { useQuery } from "@tanstack/react-query";
import type { CompanyDetail } from "@/server/company-detail";

export async function fetchCompanyDetail(
  companyId: string,
  userId: string,
  token: string | null,
): Promise<CompanyDetail> {
  const headers: Record<string, string> = {};
  if (token) headers["X-API-Key"] = token;
  const res = await fetch(
    `/api/company/${encodeURIComponent(companyId)}?userId=${encodeURIComponent(userId)}`,
    { headers },
  );
  if (!res.ok) throw new Error(`Error al cargar la empresa (HTTP ${res.status})`);
  return (await res.json()) as CompanyDetail;
}

export function useCompanyDetail(companyId: string | null, userId: string | null, token: string | null) {
  return useQuery({
    queryKey: ["company", companyId, userId, Boolean(token)],
    queryFn: () => fetchCompanyDetail(companyId as string, userId as string, token),
    enabled: Boolean(companyId && userId),
  });
}
```

- [ ] **Step 4: Implementar `use-optimizer.ts`**

```ts
"use client";
import { useQuery } from "@tanstack/react-query";
import type { OptimizerResult } from "@/server/optimizer";

export async function fetchOptimizer(): Promise<OptimizerResult> {
  const res = await fetch("/api/optimizer");
  if (!res.ok) throw new Error(`Error al cargar el optimizador (HTTP ${res.status})`);
  return (await res.json()) as OptimizerResult;
}

export function useOptimizer() {
  return useQuery({ queryKey: ["optimizer"], queryFn: fetchOptimizer });
}
```

- [ ] **Step 5: Implementar `use-prices.ts`**

```ts
"use client";
import { useQuery } from "@tanstack/react-query";
import type { PriceMap } from "@/lib/economy";

export async function fetchPrices(): Promise<PriceMap> {
  const res = await fetch("/api/prices");
  if (!res.ok) throw new Error(`Error al cargar los precios (HTTP ${res.status})`);
  return (await res.json()) as PriceMap;
}

export function usePrices() {
  return useQuery({ queryKey: ["prices"], queryFn: fetchPrices });
}
```

- [ ] **Step 6: Correr + tsc**

Run: `npx vitest run src/lib/client/use-company-detail.test.ts` → PASS.
Run: `./node_modules/.bin/tsc --noEmit` → exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/lib/client/use-company-detail.ts src/lib/client/use-company-detail.test.ts src/lib/client/use-optimizer.ts src/lib/client/use-prices.ts
git commit -m "feat(ui): add company-detail, optimizer and prices data hooks"
```

---

### Task 6: Pantalla de detalle de empresa

**Files:**
- Create: `src/components/detail/breakdown.tsx`, `src/components/detail/workers-panel.tsx`, `src/components/detail/breakdown.test.tsx`, `src/app/company/[id]/page.tsx`

- [ ] **Step 1: `breakdown.tsx`**

```tsx
import { Card } from "@/components/ui/card";
import { formatMoney, formatPerDay } from "@/lib/format";
import type { ProfitBreakdown } from "@/lib/economy";

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className={strong ? "font-medium" : "text-muted-foreground"}>{label}</span>
      <span className={`tabular ${strong ? "font-bold" : ""}`}>{value}</span>
    </div>
  );
}

export function Breakdown({ profit }: { profit: ProfitBreakdown }) {
  return (
    <Card className="cursor-default">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Desglose diario</h2>
      <Row label="Ingresos" value={formatMoney(profit.revenue)} />
      <Row label="Materiales" value={`-${formatMoney(profit.inputCost)}`} />
      <Row label="Salarios" value={`-${formatMoney(profit.wageCost)}`} />
      <Row label="Impuestos" value={`-${formatMoney(profit.tax)}`} />
      <div className="my-1 border-t border-border" />
      <Row label="Neto / día" value={formatPerDay(profit.netProfit)} strong />
    </Card>
  );
}
```

- [ ] **Step 2: `workers-panel.tsx`**

```tsx
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserPlus, Lock } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { isOverpaid } from "@/lib/ui/worker-status";

export function WorkersPanel({
  workers,
  wagesAvailable,
  maxWage,
}: {
  workers: { wage: number }[];
  wagesAvailable: boolean;
  maxWage: number;
}) {
  return (
    <Card className="cursor-default">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Trabajadores</h2>
      {!wagesAvailable ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Lock className="h-4 w-4" aria-hidden="true" /> Agregá tu API token para ver los salarios.
        </div>
      ) : workers.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin trabajadores contratados.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {workers.map((w, i) => {
            const over = isOverpaid(w.wage, maxWage);
            return (
              <li key={i} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Trabajador {i + 1}</span>
                <span className="flex items-center gap-2">
                  <span className="tabular">{formatMoney(w.wage)}</span>
                  {over ? <Badge tone="warning">sobrepagado</Badge> : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-3 flex items-center gap-1.5 text-xs text-accent">
        <UserPlus className="h-3.5 w-3.5" aria-hidden="true" /> Salario máximo recomendado: {formatMoney(maxWage)} (estimado)
      </div>
    </Card>
  );
}
```

- [ ] **Step 3: Test de `Breakdown`**

`src/components/detail/breakdown.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Breakdown } from "./breakdown";

describe("Breakdown", () => {
  it("muestra ingresos y neto", () => {
    render(
      <Breakdown
        profit={{ unitsPerDay: 10, revenue: 15, inputCost: 2, wageCost: 3, tax: 1.5, netProfit: 8.5, estimated: true }}
      />,
    );
    expect(screen.getByText("Ingresos")).toBeInTheDocument();
    expect(screen.getByText("+8.50 /día")).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: `src/app/company/[id]/page.tsx`**

```tsx
"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Cog } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { StatusDot } from "@/components/ui/status-dot";
import { Breakdown } from "@/components/detail/breakdown";
import { WorkersPanel } from "@/components/detail/workers-panel";
import { useCompanyDetail } from "@/lib/client/use-company-detail";
import { getUserId, getToken } from "@/lib/client/token-store";
import { companyStatus } from "@/lib/ui/company-status";
import { formatPerDay } from "@/lib/format";

const LABEL = { good: "rentable", low: "margen bajo", loss: "en pérdida" } as const;

export default function CompanyDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const id = getUserId();
    if (!id) {
      router.replace("/onboarding");
      return;
    }
    setUserId(id);
    setToken(getToken());
  }, [router]);

  const { data, isLoading, isError, error } = useCompanyDetail(params.id, userId, token);

  return (
    <AppShell hasToken={Boolean(token)}>
      <Link
        href="/dashboard"
        className="mb-4 inline-flex items-center gap-1.5 rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Volver
      </Link>

      {isLoading || !userId ? (
        <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
          <Spinner /> Cargando empresa…
        </div>
      ) : isError ? (
        <Card className="cursor-default border-destructive/40">
          <p className="text-destructive">
            No se pudo cargar: {error instanceof Error ? error.message : String(error)}
          </p>
        </Card>
      ) : data ? (
        (() => {
          const status = companyStatus(data.report.profit.netProfit);
          const positive = data.report.profit.netProfit >= 0;
          return (
            <div className="flex flex-col gap-6">
              <div className="flex items-center justify-between">
                <h1 className="flex items-center gap-2 text-2xl font-bold">
                  <StatusDot color={status.color} label={LABEL[status.level]} />
                  <span className="font-mono">{data.itemCode}</span>
                </h1>
                <Badge tone={status.color}>{LABEL[status.level]}</Badge>
              </div>
              <div className={`tabular text-3xl font-bold ${positive ? "text-success" : "text-destructive"}`}>
                {formatPerDay(data.report.profit.netProfit)}
                {data.estimated ? <span className="ml-2 text-xs text-muted-foreground">estimado</span> : null}
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Breakdown profit={data.report.profit} />
                <WorkersPanel
                  workers={data.workers}
                  wagesAvailable={data.wagesAvailable}
                  maxWage={data.report.maxWageToHire}
                />
              </div>

              <Card className="cursor-default">
                <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  <Cog className="h-4 w-4" aria-hidden="true" /> Mejoras
                </h2>
                <div className="flex flex-wrap gap-2 text-sm">
                  <Badge>Motor automatizado: nivel {data.upgrades.automatedEngine}</Badge>
                  <Badge>Sala de descanso: nivel {data.upgrades.breakRoom}</Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">El ROI de mejoras llegará con la calibración.</p>
              </Card>

              {data.recipe.length > 0 ? (
                <Card className="cursor-default">
                  <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Receta (por unidad)
                  </h2>
                  <ul className="flex flex-col gap-1 text-sm">
                    {data.recipe.map((r) => (
                      <li key={r.input} className="flex justify-between">
                        <span className="font-mono">{r.input}</span>
                        <span className="tabular">{r.qtyPerUnit}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              ) : null}
            </div>
          );
        })()
      ) : null}
    </AppShell>
  );
}
```

- [ ] **Step 5: Correr tests + tsc + build**

Run: `npx vitest run src/components/detail/breakdown.test.tsx` → PASS.
Run: `npm test` → verde; `./node_modules/.bin/tsc --noEmit` → exit 0; `npm run build` → compila (ruta `/company/[id]`).

- [ ] **Step 6: Commit**

```bash
git add src/components/detail/ "src/app/company/[id]/page.tsx"
git commit -m "feat(ui): add company detail screen"
```

---

### Task 7: Pantalla del optimizador

**Files:**
- Create: `src/app/optimizer/page.tsx`

- [ ] **Step 1: Implementar la página**

```tsx
"use client";
import { useState } from "react";
import { ArrowUpDown } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useOptimizer } from "@/lib/client/use-optimizer";
import { sortBy, type SortDir } from "@/lib/ui/sort-table";
import { formatMoney } from "@/lib/format";

export default function OptimizerPage() {
  const { data, isLoading, isError, error } = useOptimizer();
  const [dir, setDir] = useState<SortDir>("desc");

  const rows = data ? sortBy(data.options, "marginPerPoint", dir) : [];

  return (
    <AppShell>
      <h1 className="mb-4 text-xl font-bold">Mejor qué producir</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Margen neto por punto de producción según los precios actuales. Mayor es mejor.
      </p>
      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
          <Spinner /> Calculando…
        </div>
      ) : isError ? (
        <Card className="cursor-default border-destructive/40">
          <p className="text-destructive">{error instanceof Error ? error.message : String(error)}</p>
        </Card>
      ) : (
        <Card className="cursor-default overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">#</th>
                <th className="px-4 py-3 font-medium">Item</th>
                <th className="px-4 py-3 text-right font-medium">
                  <button
                    onClick={() => setDir((d) => (d === "desc" ? "asc" : "desc"))}
                    className="inline-flex items-center gap-1 cursor-pointer transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                  >
                    Margen / punto <ArrowUpDown className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o, i) => (
                <tr key={o.itemCode} className="border-b border-border last:border-0">
                  <td className="tabular px-4 py-2.5 text-muted-foreground">{i + 1}</td>
                  <td className="px-4 py-2.5 font-mono">{o.itemCode}</td>
                  <td className="tabular px-4 py-2.5 text-right">{formatMoney(o.marginPerPoint)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </AppShell>
  );
}
```

- [ ] **Step 2: tsc + build**

Run: `./node_modules/.bin/tsc --noEmit` → exit 0; `npm run build` → compila (ruta `/optimizer`).

- [ ] **Step 3: Commit**

```bash
git add src/app/optimizer/page.tsx
git commit -m "feat(ui): add production optimizer screen"
```

---

### Task 8: Pantalla de mercado (precios)

**Files:**
- Create: `src/app/market/page.tsx`

- [ ] **Step 1: Implementar la página**

```tsx
"use client";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { usePrices } from "@/lib/client/use-prices";
import { sortBy, type SortDir } from "@/lib/ui/sort-table";
import { formatMoney } from "@/lib/format";

export default function MarketPage() {
  const { data, isLoading, isError, error } = usePrices();
  const [query, setQuery] = useState("");
  const [dir, setDir] = useState<SortDir>("desc");

  const rows = useMemo(() => {
    const entries = Object.entries(data ?? {}).map(([item, price]) => ({ item, price }));
    const filtered = entries.filter((r) => r.item.toLowerCase().includes(query.toLowerCase()));
    return sortBy(filtered, "price", dir);
  }, [data, query, dir]);

  return (
    <AppShell>
      <h1 className="mb-4 text-xl font-bold">Mercado</h1>
      <div className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3">
        <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar item…"
          aria-label="Buscar item"
          className="h-10 flex-1 bg-transparent outline-none"
        />
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
          <Spinner /> Cargando precios…
        </div>
      ) : isError ? (
        <Card className="cursor-default border-destructive/40">
          <p className="text-destructive">{error instanceof Error ? error.message : String(error)}</p>
        </Card>
      ) : (
        <Card className="cursor-default overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">Item</th>
                <th className="px-4 py-3 text-right font-medium">
                  <button
                    onClick={() => setDir((d) => (d === "desc" ? "asc" : "desc"))}
                    className="cursor-pointer transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                  >
                    Precio
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.item} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5 font-mono">{r.item}</td>
                  <td className="tabular px-4 py-2.5 text-right">{formatMoney(r.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-4 py-3 text-xs text-muted-foreground">Las tendencias históricas llegan en el Plan 3.</p>
        </Card>
      )}
    </AppShell>
  );
}
```

- [ ] **Step 2: tsc + build**

Run: `./node_modules/.bin/tsc --noEmit` → exit 0; `npm run build` → compila (ruta `/market`).

- [ ] **Step 3: Commit**

```bash
git add src/app/market/page.tsx
git commit -m "feat(ui): add market prices screen"
```

---

### Task 9: Link "Optimizador" en la nav

**Files:**
- Modify: `src/components/app-shell.tsx`, `src/components/app-shell.test.tsx`

- [ ] **Step 1: Agregar el link**

En `src/components/app-shell.tsx`, importar `Boxes` de lucide-react y agregar, ANTES del link de Mercado, dentro del `<div className="flex items-center gap-4 text-sm">`:
```tsx
            <Link
              href="/optimizer"
              className="flex items-center gap-1.5 rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Boxes className="h-4 w-4" aria-hidden="true" /> Optimizador
            </Link>
```
Actualizar el import: `import { LineChart, KeyRound, Boxes } from "lucide-react";`

- [ ] **Step 2: Agregar aserción al test**

En `src/components/app-shell.test.tsx`, dentro del primer test (`hasToken`), agregar:
```tsx
    expect(screen.getByText("Optimizador")).toBeInTheDocument();
```

- [ ] **Step 3: Correr + tsc + build**

Run: `npx vitest run src/components/app-shell.test.tsx` → PASS.
Run: `npm test` → verde; `./node_modules/.bin/tsc --noEmit` → exit 0; `npm run build` → compila.

- [ ] **Step 4: Commit**

```bash
git add src/components/app-shell.tsx src/components/app-shell.test.tsx
git commit -m "feat(ui): add optimizer link to navigation"
```

---

## Verificación final del Plan 5

- [ ] `npm test` → todos verdes (Plan 1–4 + nuevos: company-report, company-detail, company route, worker-status, sort-table, use-company-detail, breakdown, app-shell actualizado).
- [ ] `./node_modules/.bin/tsc --noEmit` → exit 0.
- [ ] `npm run build` → compila; rutas nuevas: `/company/[id]`, `/optimizer`, `/market`, `/api/company/[id]`.
- [ ] `npm run dev` + verificación manual con el usuario real (`userId 6a141b049be11c48c9d30c50`, BebetoSan, 4 empresas: steel/iron/oil/petroleum):
  - Dashboard → click en una tarjeta → `/company/[id]` muestra desglose, mejoras (niveles), receta; trabajadores piden token.
  - `/optimizer` muestra el ranking ordenable.
  - `/market` lista precios, buscar "steel" filtra, ordenar por precio funciona.
  - Nav tiene Optimizador + Mercado; sin scroll horizontal a 375px.
- [ ] Verificación visual con Playwright (capturas de `/company/[id]`, `/optimizer`, `/market` en desktop y mobile).

## Notas para el Plan 3 (histórico de precios)

- Cron que llama `client.getPrices()` cada 15–30 min → guarda snapshots en DB (SQLite local → Postgres).
- Endpoint `/api/prices/history?item=` → serie temporal.
- En `/market`: agregar gráfico de tendencia (Recharts) por item + tabla accesible alternativa; respetar `prefers-reduced-motion`.
- Calibración: comparar `netProfit` estimado vs `transaction.getPaginatedTransactions` reales; fijar `productionToUnitsPerDay` y `calibrated:true`. Atención: empresas con automatedEngine alto y 0 trabajadores (steel/iron de BebetoSan) muestran que la producción depende fuertemente de la automatización — la calibración debe modelar eso.
```
